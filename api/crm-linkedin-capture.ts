/**
 * api/crm-linkedin-capture.ts — Pré-processador da captura do CRM LinkedIn
 *
 * v1.0 (14/08/2026)
 *
 * ══════════════════════════════════════════════════════════════════════
 * O QUE ESTE ENDPOINT FAZ — E, PRINCIPALMENTE, O QUE ELE NÃO FAZ
 * ══════════════════════════════════════════════════════════════════════
 *
 * A extensão "RMS-RAISA CRM LinkedIn" captura um perfil e precisa que o
 * lead termine na Base de Leads. Todo o trabalho pesado dessa jornada JÁ
 * EXISTE em produção no api/prospect-revalidate.ts v1.8:
 *
 *   ETAPA 0  triagem (opt-out, TTL, MX do domínio)
 *   ETAPA 1  validação de entregabilidade (lib/validate-emails.ts)
 *   ETAPA 2  Apollo People Match — recebendo `linkedin_url`, que é o
 *            identificador mais forte que existe para match de pessoa
 *   ETAPA 2-B fallback Gemini Search Grounding
 *   ETAPA 3  re-busca de e-mail (lib/email-finder.ts)
 *   ETAPA 4  persistência em prospect_leads (motor='importacao_lista')
 *   ETAPA 5  auto-promoção para email_leads (lib/promover-email-lead.ts)
 *
 * E o roteamento que o produto pede cai naturalmente desse pipeline:
 *
 *   e-mail confirmado  → ETAPA 5 promove → email_leads → aba "Meus Leads"
 *   e-mail não confirmado → fica em prospect_leads → aba "Leads Importados"
 *
 * Portanto este endpoint NÃO reimplementa cascade, NÃO insere em
 * email_leads e NÃO decide promoção. Ele resolve apenas as 4 lacunas que
 * o pipeline não cobre para esta origem específica:
 *
 *   (1) RBAC + trava de vertical
 *       Só Administrador, Gestão Comercial e SDR capturam. E a vertical
 *       CRECI é REJEITADA: a regra permanente do projeto trava o funil
 *       CRECI nos dois sentidos — nenhum lead de fora vira CRECI. Um
 *       perfil do LinkedIn nunca é um corretor vindo daquele funil.
 *
 *   (2) Deduplicação por linkedin_url
 *       O pipeline dedupe por E-MAIL (prospect-revalidate v1.4). Mas na
 *       captura o e-mail ainda não existe — a chave natural aqui é a URL
 *       canônica do perfil. Sem esta checagem, capturar duas vezes o
 *       mesmo perfil gastaria 2 créditos Apollo e 2 unidades de cota.
 *
 *   (3) Resolução do domínio da empresa
 *       O LinkedIn dá o NOME da empresa, nunca o domínio. Sem domínio não
 *       há como inferir e-mail nem como o Snov.io buscar na ETAPA 3.
 *       Usa lib/resolve-dominio.ts (in-process — fetch cross-function é
 *       bloqueado pelo Deployment Protection em Preview).
 *
 *   (4) E-mail no padrão nome.sobrenome@dominio
 *       Requisito de produto: quando nenhuma API encontra o e-mail, o
 *       lead precisa chegar em "Leads Importados" JÁ COM um endereço
 *       provável, para o Admin/GC/SDR conferir e corrigir. O e-mail
 *       inferido entra no payload e é submetido à validação da ETAPA 1
 *       como qualquer outro — se validar, promove; se não, fica para
 *       revisão. Nenhum e-mail inventado entra em campanha sem passar
 *       pelo mesmo portão de entregabilidade dos demais.
 *
 * ══════════════════════════════════════════════════════════════════════
 * CONTRATO
 * ══════════════════════════════════════════════════════════════════════
 *
 * POST /api/crm-linkedin-capture
 *   Body: {
 *     user_id: number, tipo_usuario: string,
 *     nome_completo: string, linkedin_url: string, vertical: string,
 *     cargo?: string, empresa_nome?: string, localizacao?: string
 *   }
 *
 *   200 duplicado:  { success: true, duplicado: true, mensagem, onde }
 *   200 pronto:     { success: true, duplicado: false, email_inferido: boolean,
 *                     lead: LeadInput }   ← enviar direto ao prospect-revalidate
 *   400 / 403 / 500: { success: false, error }
 *
 * O caller (background.js da extensão) encadeia a chamada seguinte a
 * /api/prospect-revalidate com `{ modo:'individual', user_id, lead }`.
 *
 * Caminho: api/crm-linkedin-capture.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { resolverDominio, DOMINIOS_PESSOAIS } from '../lib/resolve-dominio.js';

export const config = { maxDuration: 30 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PERFIS_AUTORIZADOS = ['Administrador', 'Gestão Comercial', 'SDR'];

/**
 * Verticais bloqueadas para esta origem.
 * CRECI tem funil, captura e regra de campanha próprios — um lead vindo
 * do LinkedIn jamais pertence a ele.
 */
const VERTICAIS_BLOQUEADAS = new Set(['creci']);

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

/** Normaliza a URL do perfil para https://www.linkedin.com/in/<slug>. */
function canonizarLinkedin(url: string): string | null {
  if (!url) return null;
  const m = String(url).split('?')[0].match(/linkedin\.com\/in\/([^\/\?#]+)/i);
  return m ? `https://www.linkedin.com/in/${m[1]}` : null;
}

const PREPOSICOES = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'del', 'di', 'van', 'von']);

/**
 * Quebra "João Silva da Costa" em primeiro="João" e ultimo="Costa".
 * Mesma regra do extrairPrimeiroEUltimo() de api/prospect-revalidate.ts —
 * manter idênticas evita divergência entre o que inferimos aqui e o que o
 * pipeline usa para consultar Apollo/Snov.io.
 */
function extrairPrimeiroEUltimo(nomeCompleto: string): { primeiro: string; ultimo: string } {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  const filtrado = partes.filter((p) => !PREPOSICOES.has(p.toLowerCase()));
  return {
    primeiro: filtrado[0] || '',
    ultimo: filtrado.length > 1 ? filtrado[filtrado.length - 1] : '',
  };
}

/** Remove acentos e tudo que não for [a-z0-9] — seguro para local-part de e-mail. */
function slugParaEmail(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Monta o e-mail no padrão nome.sobrenome@dominio.
 * Retorna null quando não há sobrenome utilizável — nesse caso é melhor
 * mandar o lead sem e-mail (o pipeline ainda tenta Apollo pela
 * linkedin_url) do que inventar um endereço de uma palavra só, que tem
 * taxa de acerto muito baixa e vira bounce.
 */
function inferirEmail(nomeCompleto: string, dominio: string): string | null {
  const { primeiro, ultimo } = extrairPrimeiroEUltimo(nomeCompleto);
  const p = slugParaEmail(primeiro);
  const u = slugParaEmail(ultimo);
  if (!p || !u) return null;
  return `${p}.${u}@${dominio}`;
}

/** Extrai cidade/estado de "São Paulo, SP, Brasil" (formato do LinkedIn). */
function parsearLocalizacao(loc: string | null): { cidade: string | null; estado: string | null } {
  if (!loc) return { cidade: null, estado: null };

  const partes = loc.split(',').map((p) => p.trim()).filter(Boolean);
  const ESTADOS_BR = new Set([
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
    'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
  ]);

  let cidade: string | null = null;
  let estado: string | null = null;

  for (const parte of partes) {
    if (!estado && ESTADOS_BR.has(parte.toUpperCase())) {
      estado = parte.toUpperCase();
      continue;
    }
    if (!cidade && !/brasil|brazil|portugal|argentina|chile/i.test(parte)) {
      cidade = parte;
    }
  }

  return { cidade, estado };
}

// ──────────────────────────────────────────────────────────────────────
// HANDLER
// ──────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — a chamada vem da extensão Chrome
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Use POST.' });
  }

  const {
    user_id,
    tipo_usuario,
    nome_completo,
    cargo,
    empresa_nome,
    linkedin_url,
    localizacao,
    vertical,
  } = req.body || {};

  // ── (1) Validação de entrada ──────────────────────────────────────
  if (!user_id || typeof user_id !== 'number') {
    return res.status(400).json({ success: false, error: 'user_id (número) é obrigatório.' });
  }
  if (!nome_completo || String(nome_completo).trim().length < 3) {
    return res.status(400).json({ success: false, error: 'nome_completo é obrigatório.' });
  }
  if (!vertical || !String(vertical).trim()) {
    return res.status(400).json({ success: false, error: 'vertical é obrigatória.' });
  }

  const linkedinCanonico = canonizarLinkedin(linkedin_url);
  if (!linkedinCanonico) {
    return res.status(400).json({
      success: false,
      error: 'linkedin_url inválida — precisa ser um perfil linkedin.com/in/…',
    });
  }

  const verticalLimpa = String(vertical).trim();

  // ── (2) Trava CRECI ───────────────────────────────────────────────
  if (VERTICAIS_BLOQUEADAS.has(verticalLimpa.toLowerCase())) {
    console.warn(`⛔ [crm-linkedin-capture] Tentativa de gravar vertical bloqueada "${verticalLimpa}" por user ${user_id}`);
    return res.status(400).json({
      success: false,
      error: `A vertical "${verticalLimpa}" tem funil próprio e não aceita leads capturados no LinkedIn. Escolha outra vertical.`,
    });
  }

  try {
    // ── (3) RBAC — confere o perfil no banco, não no que veio do body ─
    const { data: usuario, error: errUser } = await supabase
      .from('app_users')
      .select('id, nome_usuario, tipo_usuario')
      .eq('id', user_id)
      .maybeSingle();

    if (errUser) throw errUser;
    if (!usuario) {
      return res.status(403).json({ success: false, error: `Usuário ${user_id} não encontrado.` });
    }
    if (!PERFIS_AUTORIZADOS.includes(usuario.tipo_usuario)) {
      return res.status(403).json({
        success: false,
        error: `Perfil "${usuario.tipo_usuario}" não pode capturar leads para o CRM.`,
      });
    }
    if (tipo_usuario && tipo_usuario !== usuario.tipo_usuario) {
      console.warn(`⚠️ [crm-linkedin-capture] tipo_usuario do body ("${tipo_usuario}") diverge do banco ("${usuario.tipo_usuario}") — vale o banco.`);
    }

    // ── (4) Deduplicação por linkedin_url ───────────────────────────
    //   Confere nas duas bases. Em prospect_leads ignoramos status
    //   'no_crm' — esse registro já foi transferido para o CRM e o
    //   duplicado real seria pego na checagem de email_leads.
    const [emailLeadsDup, prospectDup] = await Promise.all([
      supabase
        .from('email_leads')
        .select('id, nome, email, arquivado')
        .eq('linkedin_url', linkedinCanonico)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('prospect_leads')
        .select('id, nome_completo, email, status')
        .eq('linkedin_url', linkedinCanonico)
        .neq('status', 'no_crm')
        .limit(1)
        .maybeSingle(),
    ]);

    if (emailLeadsDup.data) {
      const d = emailLeadsDup.data;
      return res.status(200).json({
        success: true,
        duplicado: true,
        onde: 'email_leads',
        lead_id: d.id,
        mensagem: d.arquivado
          ? `${d.nome} já está na Base de Leads, arquivado. Restaure pela aba Meus Leads em vez de capturar de novo.`
          : `${d.nome} <${d.email}> já está na Base de Leads.`,
      });
    }

    if (prospectDup.data) {
      const d = prospectDup.data;
      return res.status(200).json({
        success: true,
        duplicado: true,
        onde: 'prospect_leads',
        lead_id: d.id,
        mensagem: `${d.nome_completo} já está em Leads Importados aguardando conferência do e-mail.`,
      });
    }

    // ── (5) Domínio da empresa ──────────────────────────────────────
    const empresaLimpa = empresa_nome ? String(empresa_nome).trim() : '';
    let dominio: string | null = null;

    if (empresaLimpa) {
      // Cache barato antes de gastar chamada Gemini: alguma empresa com
      // esse nome já tem domínio conhecido em email_empresas?
      const { data: empCache } = await supabase
        .from('email_empresas')
        .select('dominio')
        .ilike('nome', empresaLimpa)
        .not('dominio', 'is', null)
        .limit(1)
        .maybeSingle();

      if (empCache?.dominio) {
        dominio = String(empCache.dominio).toLowerCase().trim();
        console.log(`📦 [crm-linkedin-capture] Domínio via cache: "${empresaLimpa}" → ${dominio}`);
      } else {
        dominio = await resolverDominio(empresaLimpa);
        if (dominio) {
          console.log(`✅ [crm-linkedin-capture] Domínio via Gemini: "${empresaLimpa}" → ${dominio}`);
        } else {
          console.log(`📋 [crm-linkedin-capture] Domínio não resolvido para "${empresaLimpa}"`);
        }
      }

      // Guarda-extra: domínio pessoal nunca vira domínio corporativo.
      if (dominio && DOMINIOS_PESSOAIS.has(dominio)) dominio = null;
    }

    // ── (6) E-mail no padrão nome.sobrenome@dominio ─────────────────
    let email: string | null = null;
    let emailInferido = false;

    if (dominio) {
      email = inferirEmail(String(nome_completo), dominio);
      emailInferido = !!email;
    }

    // ── (7) Payload pronto para o pipeline ──────────────────────────
    const { primeiro, ultimo } = extrairPrimeiroEUltimo(String(nome_completo).trim());
    const { cidade, estado } = parsearLocalizacao(localizacao || null);

    const lead = {
      criar_se_nao_existir: true,
      nome_completo: String(nome_completo).trim(),
      primeiro_nome: primeiro || undefined,
      ultimo_nome: ultimo || undefined,
      cargo: cargo ? String(cargo).trim() : undefined,
      empresa_nome: empresaLimpa || undefined,
      empresa_dominio: dominio || undefined,
      email: email || undefined,
      linkedin_url: linkedinCanonico,
      reservado_por: usuario.id,
      vertical: verticalLimpa,
      tier_pipeline: 'ativo' as const,
    };

    console.log(
      `🔵 [crm-linkedin-capture] "${lead.nome_completo}" @ ${empresaLimpa || 'sem empresa'} ` +
      `| dominio=${dominio || 'null'} | email=${email || 'null'}${emailInferido ? ' (inferido)' : ''} ` +
      `| vertical=${verticalLimpa} | reservado_por=${usuario.id}`
    );

    return res.status(200).json({
      success: true,
      duplicado: false,
      email_inferido: emailInferido,
      dominio_resolvido: dominio,
      // cidade/estado seguem separados: LeadInput do prospect-revalidate
      // não os aceita, mas o front pode exibir e a evolução futura pode usar.
      localizacao: { cidade, estado },
      lead,
    });
  } catch (error: any) {
    console.error(`❌ [crm-linkedin-capture] ${error?.message}`);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno ao preparar o lead.',
    });
  }
}
