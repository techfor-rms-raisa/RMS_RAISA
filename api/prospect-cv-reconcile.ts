/**
 * api/prospect-cv-reconcile.ts
 *
 * RECONCILIAÇÃO DO BACKLOG DE CVs SEM LEADS
 *
 * Endpoint dedicado para processar candidatos que tiveram seus CVs cadastrados
 * mas cujas empresas não foram extraídas para prospect_leads — o backlog do
 * bug silencioso de 91 dias (trigger trg_cv_extract_prospect com body::text,
 * descoberto em 25/06/2026).
 *
 * MODOS:
 *   GET                                     → { pendentes: N }
 *   POST { user_id, limite: 20 }            → processa 1 lote
 *
 * RBAC:
 *   POST exige user_id de tipo_usuario = 'Administrador' (validado server-side)
 *   GET é aberto (apenas count, sem dados sensíveis)
 *
 * COMPORTAMENTO:
 *   • Idempotente: chamada N vezes processa pendentes restantes a cada vez
 *   • Usa RPC count_cv_pendentes() e cv_pendentes_paginados()
 *   • Lógica de processamento replica processarPessoa() de prospect-cv-extract.ts
 *     (duplicação intencional para isolamento — eventual refator para lib/
 *     compartilhada fica para outro turno)
 *
 * Versão: 1.0
 * Data:    25/06/2026 (Fase 3)
 * Autor:   Messias + Claude DEV / Claude DBA
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 300 }; // 5 min, para suportar lotes maiores

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── TIPOS ────────────────────────────────────────────────────────────────────

type MotorCV = 'cv_alocacao' | 'cv_infra' | 'cv_ia_ml' | 'cv_sap';

interface PessoaExperiencia {
  empresa: string;
  cargo: string;
  data_inicio: string | null;
  data_fim: string | null;
}

interface PessoaSkill {
  skill_nome: string;
}

interface PessoaData {
  id: number;
  nome: string;
  email: string | null;
  linkedin_url: string | null;
  cidade: string | null;
  estado: string | null;
  experiencias: PessoaExperiencia[];
  skills: PessoaSkill[];
}

// ─── KEYWORDS DE CLASSIFICAÇÃO ───────────────────────────────────────────────
// Espelha o que está em prospect-cv-extract.ts v1.1

const KEYWORDS: Record<MotorCV, string[]> = {
  cv_sap: [
    'sap', 'abap', 'basis', 'fiori', 'hana', 's/4', 's4hana', 'ecc',
    'fi/co', 'fi co', 'sd', 'mm', 'pp', 'wm', 'pm', 'ps', 'hr', 'hcm',
    'successfactors', 'ariba', 'concur', 'bw', 'bi sap',
  ],
  cv_infra: [
    'infraestrutura', 'infrastructure', 'cloud', 'aws', 'azure', 'gcp',
    'google cloud', 'redes', 'network', 'firewall', 'vpn', 'vmware',
    'virtualização', 'datacenter', 'data center', 'linux', 'windows server',
    'active directory', 'siem', 'soc', 'cyber', 'segurança', 'security',
    'pentest', 'iso 27001', 'nist', 'devops', 'sre', 'kubernetes', 'docker',
    'terraform', 'ansible', 'monitoramento', 'zabbix', 'nagios',
  ],
  cv_ia_ml: [
    'dados', 'data', 'machine learning', 'ml', 'ia', 'ai', 'inteligência artificial',
    'ciência de dados', 'data science', 'engenharia de dados', 'data engineer',
    'analytics', 'bi', 'business intelligence', 'power bi', 'tableau', 'qlik',
    'spark', 'hadoop', 'kafka', 'airflow', 'dbt', 'databricks', 'snowflake',
    'dba', 'banco de dados', 'oracle', 'sql server', 'postgresql', 'mysql',
    'mongodb', 'redis', 'etl', 'pipeline', 'python', 'r language',
    'deep learning', 'nlp', 'llm',
  ],
  cv_alocacao: [
    'desenvolvedor', 'developer', 'desenvolvimento', 'development',
    'java', '.net', 'dotnet', 'c#', 'c++', 'python', 'javascript',
    'typescript', 'react', 'angular', 'vue', 'node', 'nodejs',
    'php', 'ruby', 'golang', 'kotlin', 'swift', 'flutter', 'dart',
    'mobile', 'android', 'ios', 'fullstack', 'full stack', 'backend',
    'frontend', 'front-end', 'back-end', 'software engineer',
    'engenheiro de software', 'programador', 'arquiteto de software',
    'microservices', 'api rest', 'springboot', 'spring boot',
  ],
};

// ─── SANITIZAÇÃO ────────────────────────────────────────────────────────────

const EMPRESA_INVALIDA_CV = new Set([
  'tempo integral', 'autônomo', 'autonomo', 'freelancer',
  'cto', 'coo', 'cfo', 'ceo', 'cio', 'ciso',
  'gerente de ti', 'gerente de projetos', 'gerente de projetos senior',
  'coordenador de ti', 'coordenadora de ti',
  'diretor geral', 'diretor de ti', 'analista de ti',
  'analista de infraestrutura sap business one',
]);

const DOMINIOS_PESSOAIS = [
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
  'live.com', 'msn.com', 'icloud.com', 'bol.com.br', 'uol.com.br',
  'terra.com.br', 'ig.com.br', 'globo.com', 'r7.com',
];

function sanitizarEmpresaCV(nome: string | null | undefined): string | null {
  if (!nome) return null;
  const trimmed = nome.trim();
  if (!trimmed) return null;
  if (EMPRESA_INVALIDA_CV.has(trimmed.toLowerCase())) return null;
  if (trimmed.length > 100) return null;
  return trimmed
    .toLowerCase()
    .replace(/(?:^|\s|[-\/&(])(\S)/g, (match) => match.toUpperCase());
}

function sanitizarNomeCV(nome: string | null | undefined): string {
  if (!nome) return '';
  return nome.trim()
    .toLowerCase()
    .replace(/(?:^|\s)(\S)/g, (match) => match.toUpperCase());
}

function extrairDominio(email: string | null): string {
  if (!email) return '';
  const parts = email.split('@');
  return parts.length > 1 ? parts[1].toLowerCase().trim() : '';
}

// ─── CLASSIFICAÇÃO DO PERFIL ────────────────────────────────────────────────

function classificarPerfil(skills: string[], cargos: string[]): MotorCV | null {
  const texto = [...skills, ...cargos].join(' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const contagem: Record<MotorCV, number> = {
    cv_sap: 0,
    cv_infra: 0,
    cv_ia_ml: 0,
    cv_alocacao: 0,
  };

  for (const [motor, keywords] of Object.entries(KEYWORDS) as [MotorCV, string[]][]) {
    for (const kw of keywords) {
      if (texto.includes(kw)) {
        contagem[motor]++;
      }
    }
  }

  let melhorMotor: MotorCV | null = null;
  let melhorCount = 0;

  for (const [motor, count] of Object.entries(contagem) as [MotorCV, number][]) {
    if (count > melhorCount) {
      melhorMotor = motor;
      melhorCount = count;
    }
  }

  return melhorCount >= 1 ? melhorMotor : null;
}

// ─── RESOLVER DOMÍNIO VIA IA ────────────────────────────────────────────────

async function resolverDominioPorIA(empresaNome: string): Promise<string | null> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const resp = await fetch(`${baseUrl}/api/prospect-resolve-domain`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ empresa_nome: empresaNome }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    return data.dominio || null;
  } catch {
    return null;
  }
}

// ─── PROCESSAR UMA PESSOA ────────────────────────────────────────────────────

async function processarPessoa(pessoa: PessoaData, userId: number | null): Promise<{
  inseridos: number;
  ignorados: number;
  empresas: string[];
}> {
  const skills = pessoa.skills.map(s => s.skill_nome || '');
  const cargos = pessoa.experiencias.map(e => e.cargo || '');
  const motor = classificarPerfil(skills, cargos);

  if (!motor) {
    return { inseridos: 0, ignorados: 0, empresas: [] };
  }

  // Deduplica empresas (mesma empresa pode aparecer em 2 experiências)
  const empresasUnicas = new Map<string, PessoaExperiencia>();
  for (const exp of pessoa.experiencias) {
    const chave = (exp.empresa || '').trim().toLowerCase();
    if (chave.length < 3) continue;
    if (!empresasUnicas.has(chave)) {
      empresasUnicas.set(chave, exp);
    }
  }

  if (empresasUnicas.size === 0) {
    return { inseridos: 0, ignorados: 0, empresas: [] };
  }

  // Domínio pessoal vs corporativo
  const dominioCandidato = extrairDominio(pessoa.email);
  const dominioPessoa = dominioCandidato && !DOMINIOS_PESSOAIS.includes(dominioCandidato)
    ? dominioCandidato
    : null;

  const rows: any[] = [];
  const nomesEmpresas: string[] = [];

  // Buscar lista de exclusões UMA vez
  const nomesParaVerificar = Array.from(empresasUnicas.keys());
  const { data: exclusoes } = await supabase
    .from('prospect_exclusoes')
    .select('nome')
    .or(nomesParaVerificar.map(n => `nome.ilike.%${n}%`).join(','));

  const nomesExcluidos = new Set(
    (exclusoes || []).map((e: any) => e.nome.toLowerCase().trim())
  );

  for (const [chave, exp] of empresasUnicas) {
    const empresaNomeRaw = exp.empresa.trim();
    const empresaNome = sanitizarEmpresaCV(empresaNomeRaw);
    if (!empresaNome) continue;
    nomesEmpresas.push(empresaNome);

    if (nomesExcluidos.has(chave)) {
      console.log(`⛔ [cv-reconcile] "${empresaNome}" na lista de exclusões — ignorado`);
      continue;
    }

    // Verificar se já existe esse par pessoa+empresa
    const { data: jaExiste } = await supabase
      .from('prospect_leads')
      .select('id')
      .eq('pessoa_id', pessoa.id)
      .ilike('empresa_nome', empresaNome)
      .limit(1);

    if (jaExiste && jaExiste.length > 0) continue;

    // Tentar resolver domínio se não temos
    let dominioEmpresa = dominioPessoa;
    if (!dominioEmpresa) {
      dominioEmpresa = await resolverDominioPorIA(empresaNome);
    }

    rows.push({
      buscado_por:      userId,
      pessoa_id:        pessoa.id,
      candidato_nome:   pessoa.nome,
      motor:            motor,
      nome_completo:    sanitizarNomeCV(pessoa.nome),
      primeiro_nome:    pessoa.nome.split(' ')[0] || '',
      ultimo_nome:      pessoa.nome.split(' ').slice(1).join(' ') || '',
      cargo:            exp.cargo?.trim() || null,
      email:            pessoa.email || null,
      email_status:     pessoa.email ? 'provavel' : null,
      linkedin_url:     pessoa.linkedin_url || null,
      empresa_nome:     empresaNome,
      empresa_dominio:  dominioEmpresa || null,
      cidade:           pessoa.cidade || null,
      estado:           pessoa.estado || null,
      pais:             'Brasil',
      departamentos:    [],
      filtros_busca:    { origem: 'cv_reconcile', pessoa_id: pessoa.id },
      enriquecido:      false,
      status:           'novo',
      exportado_por:    null,
      exportado_em:     null,
    });
  }

  if (rows.length === 0) {
    return { inseridos: 0, ignorados: empresasUnicas.size, empresas: nomesEmpresas };
  }

  const { data, error } = await supabase
    .from('prospect_leads')
    .insert(rows)
    .select('id');

  if (error) {
    console.error(`❌ [cv-reconcile] Erro pessoa ${pessoa.id}:`, error.message);
    return { inseridos: 0, ignorados: rows.length, empresas: nomesEmpresas };
  }

  return {
    inseridos: data?.length || 0,
    ignorados: empresasUnicas.size - (data?.length || 0),
    empresas: nomesEmpresas,
  };
}

// ─── VALIDAÇÃO RBAC ──────────────────────────────────────────────────────────

async function validarAdministrador(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_users')
    .select('tipo_usuario')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return false;
  return data.tipo_usuario === 'Administrador';
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── GET: apenas count ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase.rpc('count_cv_pendentes');
    if (error) {
      console.error('[cv-reconcile] erro ao contar pendentes:', error.message);
      return res.status(500).json({ error: error.message, pendentes: 0 });
    }
    return res.status(200).json({ pendentes: Number(data) || 0 });
  }

  // ── POST: processar lote ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { user_id, limite = 20 } = req.body || {};

    if (!user_id) {
      return res.status(400).json({ error: 'user_id obrigatório' });
    }

    const isAdmin = await validarAdministrador(user_id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Apenas administradores podem reconciliar CVs' });
    }

    // 1) Pegar IDs do lote via RPC
    const limiteSeguro = Math.min(Math.max(Number(limite) || 20, 1), 50);
    const { data: ids, error: errIds } = await supabase
      .rpc('cv_pendentes_paginados', { p_limite: limiteSeguro });

    if (errIds) {
      console.error('[cv-reconcile] erro ao buscar pendentes:', errIds.message);
      return res.status(500).json({ error: errIds.message });
    }

    if (!ids || ids.length === 0) {
      return res.status(200).json({
        processados: 0,
        leads_inseridos: 0,
        leads_ignorados: 0,
        restantes: 0,
        terminou: true,
      });
    }

    // 2) Buscar dados completos das pessoas (com experiências e skills)
    const idsLista = ids.map((r: any) => r.pessoa_id);
    const { data: pessoas, error: errPessoas } = await supabase
      .from('pessoas')
      .select(`
        id, nome, email, linkedin_url, cidade, estado,
        pessoa_experiencias ( empresa, cargo, data_inicio, data_fim ),
        pessoa_skills ( skill_nome )
      `)
      .in('id', idsLista);

    if (errPessoas) {
      console.error('[cv-reconcile] erro ao buscar dados das pessoas:', errPessoas.message);
      return res.status(500).json({ error: errPessoas.message });
    }

    // 3) Processar cada pessoa em sequência
    let totalInseridos = 0;
    let totalIgnorados = 0;
    let totalProcessados = 0;
    const erros: string[] = [];

    for (const p of (pessoas || [])) {
      try {
        const r = await processarPessoa({
          id:           p.id,
          nome:         p.nome,
          email:        p.email,
          linkedin_url: p.linkedin_url,
          cidade:       p.cidade,
          estado:       p.estado,
          experiencias: (p as any).pessoa_experiencias || [],
          skills:       (p as any).pessoa_skills || [],
        }, user_id);

        totalInseridos  += r.inseridos;
        totalIgnorados  += r.ignorados;
        totalProcessados++;
      } catch (err: any) {
        erros.push(`Pessoa ${p.id}: ${err?.message || 'erro desconhecido'}`);
      }
    }

    // 4) Contar quantos ainda restam após este lote
    const { data: restantesData } = await supabase.rpc('count_cv_pendentes');
    const restantes = Number(restantesData) || 0;

    console.log(`✅ [cv-reconcile] lote concluído: ${totalProcessados} processados, ${totalInseridos} leads inseridos, ${restantes} restantes`);

    return res.status(200).json({
      processados:     totalProcessados,
      leads_inseridos: totalInseridos,
      leads_ignorados: totalIgnorados,
      restantes,
      terminou:        restantes === 0,
      erros:           erros.length > 0 ? erros : undefined,
    });
  }

  return res.status(405).json({ error: 'Use GET para count ou POST para processar' });
}
