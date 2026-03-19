/**
 * api/prospect-infer-emails.ts
 * 
 * Detecta o padrão de email de um domínio a partir de emails conhecidos
 * e infere emails faltantes aplicando o mesmo padrão.
 * 
 * Padrões suportados:
 * - nome.sobrenome@dominio.com.br
 * - n.sobrenome@dominio.com.br  
 * - nome_sobrenome@dominio.com.br
 * - nomesobrenome@dominio.com.br
 * - nome@dominio.com.br
 * - sobrenome@dominio.com.br
 * 
 * Versão: 1.0
 * Data: 18/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 15 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── NORMALIZAÇÃO ───
function normalizar(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remover acentos
    .trim();
}

function extrairNomeSobrenome(nomeCompleto: string): { primeiro: string; ultimo: string; inicialPrimeiro: string } {
  const partes = normalizar(nomeCompleto).split(/\s+/).filter(Boolean);
  // Remover preposições comuns
  const filtrado = partes.filter(p => !['de', 'da', 'do', 'dos', 'das', 'e'].includes(p));
  return {
    primeiro: filtrado[0] || '',
    ultimo: filtrado.length > 1 ? filtrado[filtrado.length - 1] : '',
    inicialPrimeiro: (filtrado[0] || '').charAt(0),
  };
}

// ─── PADRÕES DE EMAIL ───
type EmailPattern = 
  | 'nome.sobrenome'     // joao.silva@
  | 'inicial.sobrenome'  // j.silva@
  | 'nome_sobrenome'     // joao_silva@
  | 'nomesobrenome'      // joaosilva@
  | 'nome'               // joao@
  | 'sobrenome'          // silva@
  | 'desconhecido';

function detectarPadrao(email: string, nomeCompleto: string): EmailPattern {
  const local = email.split('@')[0]?.toLowerCase() || '';
  const { primeiro, ultimo, inicialPrimeiro } = extrairNomeSobrenome(nomeCompleto);

  if (!primeiro || !local) return 'desconhecido';

  if (local === `${primeiro}.${ultimo}`) return 'nome.sobrenome';
  if (local === `${inicialPrimeiro}.${ultimo}`) return 'inicial.sobrenome';
  if (local === `${primeiro}_${ultimo}`) return 'nome_sobrenome';
  if (local === `${primeiro}${ultimo}`) return 'nomesobrenome';
  if (local === primeiro) return 'nome';
  if (local === ultimo) return 'sobrenome';

  // Tentar match parcial
  if (local.includes('.') && local.includes(primeiro) && local.includes(ultimo)) return 'nome.sobrenome';
  if (local.includes('.') && local.startsWith(inicialPrimeiro) && local.includes(ultimo)) return 'inicial.sobrenome';
  if (local.includes('_') && local.includes(primeiro)) return 'nome_sobrenome';

  return 'desconhecido';
}

function aplicarPadrao(padrao: EmailPattern, nomeCompleto: string, dominio: string): string {
  const { primeiro, ultimo, inicialPrimeiro } = extrairNomeSobrenome(nomeCompleto);
  if (!primeiro || !dominio) return '';

  switch (padrao) {
    case 'nome.sobrenome':     return `${primeiro}.${ultimo}@${dominio}`;
    case 'inicial.sobrenome':  return `${inicialPrimeiro}.${ultimo}@${dominio}`;
    case 'nome_sobrenome':     return `${primeiro}_${ultimo}@${dominio}`;
    case 'nomesobrenome':      return `${primeiro}${ultimo}@${dominio}`;
    case 'nome':               return `${primeiro}@${dominio}`;
    case 'sobrenome':          return `${ultimo}@${dominio}`;
    default:                   return `${primeiro}.${ultimo}@${dominio}`; // fallback
  }
}

// ─── HANDLER ───
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { leads, emails_conhecidos } = req.body;
    // leads: [{ nome, dominio, email_existente }]
    // emails_conhecidos: [{ email, dominio }]

    if (!leads || !Array.isArray(leads)) {
      return res.status(400).json({ error: 'leads é obrigatório (array)' });
    }

    console.log(`📧 [infer-emails] ${leads.length} leads para inferir, ${(emails_conhecidos || []).length} emails conhecidos`);

    // Agrupar emails conhecidos por domínio
    const emailsPorDominio: Record<string, { email: string; nome?: string }[]> = {};
    for (const ek of (emails_conhecidos || [])) {
      const d = ek.dominio?.toLowerCase();
      if (!d || !ek.email) continue;
      if (!emailsPorDominio[d]) emailsPorDominio[d] = [];
      emailsPorDominio[d].push(ek);
    }

    // Buscar emails adicionais do banco para detectar padrão
    const dominiosUnicos = [...new Set(leads.map((l: any) => l.dominio?.toLowerCase()).filter(Boolean))];
    
    for (const dominio of dominiosUnicos) {
      const { data: dbEmails } = await supabase
        .from('prospect_leads')
        .select('email, nome_completo')
        .eq('empresa_dominio', dominio)
        .not('email', 'is', null)
        .limit(10);
      
      if (dbEmails && dbEmails.length > 0) {
        if (!emailsPorDominio[dominio]) emailsPorDominio[dominio] = [];
        for (const row of dbEmails) {
          emailsPorDominio[dominio].push({ email: row.email, nome: row.nome_completo });
        }
      }
    }

    // Detectar padrão por domínio
    const padraoPorDominio: Record<string, EmailPattern> = {};
    for (const [dominio, emails] of Object.entries(emailsPorDominio)) {
      const contagem: Record<EmailPattern, number> = {
        'nome.sobrenome': 0, 'inicial.sobrenome': 0, 'nome_sobrenome': 0,
        'nomesobrenome': 0, 'nome': 0, 'sobrenome': 0, 'desconhecido': 0,
      };

      for (const { email, nome } of emails) {
        if (!nome) continue;
        const padrao = detectarPadrao(email, nome);
        contagem[padrao]++;
      }

      // Pegar o padrão mais frequente (ignorando 'desconhecido')
      let melhorPadrao: EmailPattern = 'nome.sobrenome'; // fallback
      let melhorCount = 0;
      for (const [p, c] of Object.entries(contagem)) {
        if (p !== 'desconhecido' && c > melhorCount) {
          melhorPadrao = p as EmailPattern;
          melhorCount = c;
        }
      }
      padraoPorDominio[dominio] = melhorPadrao;
      console.log(`  📊 ${dominio}: padrão = ${melhorPadrao} (${melhorCount} matches)`);
    }

    // Inferir emails faltantes
    const inferidos: { nome: string; dominio: string; email_inferido: string; padrao: string }[] = [];
    
    for (const lead of leads) {
      const dominio = lead.dominio?.toLowerCase();
      if (!dominio || !lead.nome) continue;
      if (lead.email_existente) continue; // já tem email

      const padrao = padraoPorDominio[dominio] || 'nome.sobrenome';
      const emailInferido = aplicarPadrao(padrao, lead.nome, dominio);

      if (emailInferido) {
        inferidos.push({
          nome: lead.nome,
          dominio,
          email_inferido: emailInferido,
          padrao,
        });
      }
    }

    console.log(`✅ [infer-emails] ${inferidos.length} emails inferidos`);
    return res.status(200).json({ inferidos, padroes: padraoPorDominio });

  } catch (error: any) {
    console.error('❌ [infer-emails]:', error?.message);
    return res.status(500).json({ error: error?.message || 'Erro interno' });
  }
}
