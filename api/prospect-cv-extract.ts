/**
 * api/prospect-cv-extract.ts
 *
 * Extrai empresas do histórico de experiências de candidatos (pessoa_experiencias)
 * e insere como leads na tabela prospect_leads com motor = cv_alocacao | cv_infra | cv_ia_ml | cv_sap
 *
 * Modos de operação:
 * - POST { modo: 'bulk' }           → carga inicial de todos os candidatos
 * - POST { modo: 'pessoa', pessoa_id } → extração de um candidato específico (trigger automático)
 * - POST { modo: 'marcar_exportado', lead_id, user_id } → marcar lead como exportado
 *
 * Versão: 1.1
 * Data: 25/03/2026
 * v1.1: empresa_dominio não recebe mais domínio pessoal do candidato
 *       (gmail, hotmail, outlook etc.) — campo fica null para preenchimento manual
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

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

// ─── KEYWORDS DE CLASSIFICAÇÃO ────────────────────────────────────────────────

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

// ─── CLASSIFICAÇÃO DO PERFIL ──────────────────────────────────────────────────

function classificarPerfil(skills: string[], cargos: string[]): MotorCV | null {
  const texto = [...skills, ...cargos].join(' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos

  // Contar matches por categoria
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

  // Perfil dominante = maior contagem
  let melhorMotor: MotorCV | null = null;
  let melhorCount = 0;

  for (const [motor, count] of Object.entries(contagem) as [MotorCV, number][]) {
    if (count > melhorCount) {
      melhorMotor = motor;
      melhorCount = count;
    }
  }

  // Mínimo de 1 match para classificar
  return melhorCount >= 1 ? melhorMotor : null;
}

// ─── EXTRAIR DOMÍNIO DE EMAIL ─────────────────────────────────────────────────

function extrairDominio(email: string | null): string {
  if (!email) return '';
  const parts = email.split('@');
  return parts.length > 1 ? parts[1].toLowerCase().trim() : '';
}

// ─── RESOLVER DOMÍNIO VIA IA ─────────────────────────────────────────────────
// Chama prospect-resolve-domain internamente via fetch (mesmo servidor Vercel)

async function resolverDominioPorIA(empresaNome: string): Promise<string | null> {
  try {
    // Em ambiente Vercel, chamar o próprio endpoint via URL absoluta não é confiável
    // Usamos a função diretamente via import dinâmico ou chamada HTTP ao próprio servidor
    // Por simplicidade e confiabilidade: chamada ao endpoint externo
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


// ─── SANITIZAÇÃO DE DADOS ──────────────────────────────────
const EMPRESA_INVALIDA_CV = new Set([
    'tempo integral', 'autônomo', 'autonomo', 'freelancer',
    'cto', 'coo', 'cfo', 'ceo', 'cio', 'ciso',
    'gerente de ti', 'gerente de projetos', 'gerente de projetos senior',
    'coordenador de ti', 'coordenadora de ti',
    'diretor geral', 'diretor de ti', 'analista de ti',
    'analista de infraestrutura sap business one',
]);

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

  // Deduplica empresas (pode aparecer 2x em experiências diferentes)
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

  // Domínios pessoais não são domínios corporativos
  const DOMINIOS_PESSOAIS = [
    'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
    'live.com', 'msn.com', 'icloud.com', 'bol.com.br', 'uol.com.br',
    'terra.com.br', 'ig.com.br', 'globo.com', 'r7.com',
  ];
  const dominioCandidato = extrairDominio(pessoa.email);
  const dominioPessoa = dominioCandidato && !DOMINIOS_PESSOAIS.includes(dominioCandidato)
    ? dominioCandidato
    : null;
  const rows: any[] = [];
  const nomesEmpresas: string[] = [];

  // Buscar lista de exclusões UMA vez para todas as empresas do lote
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
    if (!empresaNome) continue; // descarta valores inválidos (cargo no lugar de empresa)
    nomesEmpresas.push(empresaNome);

    // Verificar se está na lista de exclusões
    if (nomesExcluidos.has(chave)) {
      console.log(`⛔ [cv-extract] "${empresaNome}" está na lista de exclusões — ignorado`);
      continue;
    }

    // Verificar se já existe esse par pessoa+empresa na tabela
    const { data: jaExiste } = await supabase
      .from('prospect_leads')
      .select('id')
      .eq('pessoa_id', pessoa.id)
      .ilike('empresa_nome', empresaNome)
      .limit(1);

    if (jaExiste && jaExiste.length > 0) continue;

    // Tentar resolver domínio corporativo via IA se não temos do candidato
    let dominioEmpresa = dominioPessoa;
    if (!dominioEmpresa) {
      dominioEmpresa = await resolverDominioPorIA(empresaNome);
      if (dominioEmpresa) {
        console.log(`🌐 [cv-extract] Domínio resolvido por IA: "${empresaNome}" → ${dominioEmpresa}`);
      } else {
        console.log(`📋 [cv-extract] Sem domínio para "${empresaNome}" — deixado para review manual`);
      }
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
      filtros_busca:    { origem: 'cv_extract', pessoa_id: pessoa.id },
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
    console.error(`❌ [cv-extract] Erro ao inserir pessoa ${pessoa.id}:`, error.message);
    return { inseridos: 0, ignorados: rows.length, empresas: nomesEmpresas };
  }

  return {
    inseridos: data?.length || 0,
    ignorados: empresasUnicas.size - (data?.length || 0),
    empresas: nomesEmpresas,
  };
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const { modo, pessoa_id, lead_id, user_id } = req.body;

  // ── MODO: marcar exportado ──────────────────────────────────────────────────
  if (modo === 'marcar_exportado') {
    if (!lead_id || !user_id) {
      return res.status(400).json({ error: 'lead_id e user_id são obrigatórios' });
    }

    const { error } = await supabase
      .from('prospect_leads')
      .update({
        exportado_por: user_id,
        exportado_em:  new Date().toISOString(),
      })
      .eq('id', lead_id);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ [cv-extract] Lead ${lead_id} marcado como exportado por user ${user_id}`);
    return res.status(200).json({ success: true });
  }

  // ── MODO: pessoa individual ─────────────────────────────────────────────────
  // user_id é OPCIONAL aqui: quando chamado pelo trigger pg_net, não há usuário.
  // Nesse caso buscado_por = null → frontend exibe "RAISA" para leads de CV automáticos.
  if (modo === 'pessoa') {
    if (!pessoa_id) {
      return res.status(400).json({ error: 'pessoa_id é obrigatório' });
    }
    // user_id pode ser null/undefined quando originado de trigger automático

    const { data: pessoas, error: errP } = await supabase
      .from('pessoas')
      .select(`
        id, nome, email, linkedin_url, cidade, estado,
        pessoa_experiencias ( empresa, cargo, data_inicio, data_fim ),
        pessoa_skills ( skill_nome )
      `)
      .eq('id', pessoa_id)
      .limit(1);

    if (errP || !pessoas || pessoas.length === 0) {
      return res.status(404).json({ error: 'Pessoa não encontrada' });
    }

    const pessoa = pessoas[0] as any;
    const result = await processarPessoa({
      id:           pessoa.id,
      nome: pessoa.nome,
      email:        pessoa.email,
      linkedin_url: pessoa.linkedin_url,
      cidade:       pessoa.cidade,
      estado:       pessoa.estado,
      experiencias: pessoa.pessoa_experiencias || [],
      skills:       pessoa.pessoa_skills || [],
    }, user_id || null);

    return res.status(200).json({ success: true, ...result });
  }

  // ── MODO: bulk (carga inicial) ──────────────────────────────────────────────
  if (modo === 'bulk') {
    if (!user_id) {
      return res.status(400).json({ error: 'user_id é obrigatório' });
    }

    console.log('🚀 [cv-extract] Iniciando carga bulk...');

    // Buscar todas as pessoas com pelo menos 1 experiência
    const { data: pessoas, error: errPessoas } = await supabase
      .from('pessoas')
      .select(`
        id, nome, email, linkedin_url, cidade, estado,
        pessoa_experiencias ( empresa, cargo, data_inicio, data_fim ),
        pessoa_skills ( skill_nome )
      `)
      .not('pessoa_experiencias', 'is', null);

    if (errPessoas) {
      return res.status(500).json({ error: errPessoas.message });
    }

    const lista = (pessoas || []).filter((p: any) =>
      p.pessoa_experiencias && p.pessoa_experiencias.length > 0
    );

    console.log(`📋 [cv-extract] ${lista.length} candidatos com experiências encontrados`);

    let totalInseridos = 0;
    let totalIgnorados = 0;
    let totalProcessados = 0;
    const erros: string[] = [];

    // Processar em lotes de 10 para não exceder timeout
    const LOTE = 10;
    for (let i = 0; i < lista.length; i += LOTE) {
      const lote = lista.slice(i, i + LOTE);
      const results = await Promise.all(
        lote.map((p: any) => processarPessoa({
          id:            p.id,
          nome: p.nome,
          email:         p.email,
          linkedin_url:  p.linkedin_url,
          cidade:        p.cidade,
          estado:        p.estado,
          experiencias:  p.pessoa_experiencias || [],
          skills:        p.pessoa_skills || [],
        }, user_id).catch(err => {
          erros.push(`Pessoa ${p.id}: ${err.message}`);
          return { inseridos: 0, ignorados: 0, empresas: [] };
        }))
      );

      for (const r of results) {
        totalInseridos  += r.inseridos;
        totalIgnorados  += r.ignorados;
        totalProcessados++;
      }
    }

    console.log(`✅ [cv-extract] Bulk concluído: ${totalInseridos} leads inseridos, ${totalIgnorados} ignorados`);

    return res.status(200).json({
      success:          true,
      processados:      totalProcessados,
      leads_inseridos:  totalInseridos,
      leads_ignorados:  totalIgnorados,
      erros:            erros.length > 0 ? erros : undefined,
    });
  }

  return res.status(400).json({ error: 'modo inválido. Use: bulk | pessoa | marcar_exportado' });
}
