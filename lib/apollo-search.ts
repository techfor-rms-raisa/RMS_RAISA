/**
 * lib/apollo-search.ts
 *
 * NÚCLEO DE BUSCA de decisores no Apollo (endpoint mixed_people/api_search),
 * extraído de api/prospect-apollo-search.ts v3.0 para uso IN-PROCESS pelo
 * orquestrador de lote api/prospect-linkedin-lote.ts.
 *
 * Por que extrair: chamar um endpoint a partir de outro via fetch (cross-function)
 * é antipattern em Vercel Preview — o Deployment Protection responde 401 com
 * HTML de login. Mesmo padrão já adotado em lib/email-finder.ts e
 * lib/validate-emails.ts: lógica na lib, endpoint HTTP é só a casca.
 *
 * ESCOPO desta lib: APENAS a BUSCA (mixed_people/api_search → 0 créditos Apollo).
 * O ENRIQUECIMENTO (people/match → 1 crédito/pessoa, com cap
 * APOLLO_DAILY_CAP_PER_USER) permanece em lib/apollo.ts (apolloPeopleMatch v2.0)
 * e será plugado na Sessão 1b. Esta lib nunca gasta crédito.
 *
 * MUDANÇA DE COMPORTAMENTO vs v3.0 (conta Apollo PAGA — confirmado 20/08/2026):
 *   Em conta paga o Apollo filtra por país nativamente. O filtro Brasil passa a
 *   ser UMA query combinada (domínio + person_locations Brazil), aplicável
 *   inclusive a domínios .com (multinacionais com operação BR — caso das casas
 *   de aposta), e não só a .com.br. A estratégia de INTERSEÇÃO DUPLA do v3.0
 *   (muleta do Free Tier) fica documentada aqui como fallback manual, caso
 *   alguma empresa retorne 0 nos primeiros lotes reais. NÃO removida às cegas:
 *   validar antes de descartar.
 *
 * Versão: 1.0
 * Data:    20/08/2026
 * Autor:   Messias + Claude DEV
 */

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// Limite de títulos por request (evita query string excessiva). Mantido do v3.0.
const MAX_TITULOS = 25;

// ─── MAPEAMENTO DE DEPARTAMENTOS → TÍTULOS APOLLO (fiel ao v3.0) ─────────────
export const DEPARTAMENTO_TITULOS: Record<string, string[]> = {
  'ti_tecnologia': [
    'CTO', 'CIO', 'IT Director', 'Director of Technology', 'Director of IT',
    'Diretor de TI', 'Diretor de Tecnologia', 'IT Manager', 'Gerente de TI',
    'Head of IT', 'Head of Technology', 'Gerente de Tecnologia',
    'Coordenador de TI', 'Solutions Architect', 'Software Engineer',
  ],
  'compras_procurement': [
    'CPO', 'Procurement Director', 'Purchasing Director', 'Procurement Manager',
    'Purchasing Manager', 'Diretor de Compras', 'Gerente de Compras',
    'Head of Procurement', 'Coordenador de Compras', 'Supply Chain Manager',
  ],
  'infraestrutura': [
    'Infrastructure Director', 'Infrastructure Manager', 'Diretor de Infraestrutura',
    'Gerente de Infraestrutura', 'Head of Infrastructure', 'IT Infrastructure Manager',
    'Network Manager', 'Systems Manager', 'Coordenador de Infraestrutura',
  ],
  'governanca_compliance': [
    'Chief Compliance Officer', 'CCO', 'Compliance Director', 'Governance Director',
    'Diretor de Governança', 'Gerente de Governança', 'Compliance Manager',
    'Gerente de Compliance', 'Risk Manager', 'Gerente de Riscos',
  ],
  'rh_recursos_humanos': [
    'CHRO', 'HR Director', 'HR Manager', 'Diretor de RH', 'Gerente de RH',
    'Head of HR', 'Head of People', 'Diretor de Pessoas', 'Gerente de Pessoas',
    'People Manager', 'Talent Manager',
  ],
  'comercial_vendas': [
    'CSO', 'Sales Director', 'Commercial Director', 'Sales Manager',
    'Diretor Comercial', 'Gerente Comercial', 'Head of Sales',
    'VP de Vendas', 'VP Comercial', 'Business Development Director',
  ],
  'financeiro': [
    'CFO', 'Finance Director', 'Finance Manager', 'Diretor Financeiro',
    'Gerente Financeiro', 'Head of Finance', 'Controller', 'Financial Controller',
  ],
  'diretoria_clevel': [
    'CEO', 'COO', 'CTO', 'CFO', 'CIO', 'CHRO', 'CSO', 'CPO',
    'President', 'Presidente', 'Vice President', 'Managing Director',
    'Diretor Geral', 'Diretor Executivo', 'Executive Director',
  ],
};

// ─── MAPEAMENTO DE SENIORIDADE → VALORES APOLLO (fiel ao v3.0) ──────────────
export const SENIORIDADE_MAP: Record<string, string> = {
  'c_level':         'c_suite',
  'vp':              'vp',
  'diretor':         'director',
  'gerente':         'manager',
  'coordenador':     'manager',
  'superintendente': 'director',
};

// ─── Localidades BR aceitas pelo Apollo em person_locations ─────────────────
const BR_LOCATIONS = [
  'São Paulo, São Paulo, Brazil',
  'Rio de Janeiro, Rio de Janeiro, Brazil',
  'Belo Horizonte, Minas Gerais, Brazil',
  'Brasília, Federal District, Brazil',
  'Brazil',
];

// ─── Domínio ccTLD brasileiro? ──────────────────────────────────────────────
function isDominioBR(domain: string): boolean {
  const d = domain.toLowerCase().trim();
  return d.endsWith('.com.br') || d.endsWith('.org.br')
      || d.endsWith('.net.br') || d.endsWith('.gov.br');
}

// ─── carrefour.com.br → carrefour.com (Apollo indexa o domínio base) ────────
function dominioBase(domain: string): string {
  const d = domain.toLowerCase().trim();
  if (!isDominioBR(d)) return d;
  const partes = d.split('.');
  return partes.length >= 3
    ? `${partes[partes.length - 3]}.${partes[partes.length - 2]}`
    : d;
}

// ─── TIPOS EXPORTADOS ───────────────────────────────────────────────────────
export interface DecisorApollo {
  apollo_id:        string;
  nome_completo:    string;
  primeiro_nome:    string;
  ultimo_nome:      string;
  cargo:            string;
  email:            string | null;
  email_status:     string | null;
  linkedin_url:     string | null;
  foto_url:         string | null;
  empresa_nome:     string;
  empresa_setor:    string | null;
  empresa_porte:    number | null;
  empresa_linkedin: string | null;
  empresa_website:  string | null;
  cidade:           string | null;
  estado:           string | null;
  pais:             string | null;
  senioridade:      string | null;
  departamentos:    string[];
  fonte:            'apollo';
  enriquecido:      false;
}

export interface BuscaApolloParams {
  domain:          string;
  departamentos?:  string[];   // chaves de DEPARTAMENTO_TITULOS; vazio = todos
  senioridades?:   string[];   // chaves de SENIORIDADE_MAP; vazio = padrão
  filtrar_brasil?: boolean;    // adiciona person_locations Brazil na mesma query
  max_resultados?: number;     // per_page (default 25)
  pagina?:         number;     // page (default 1)
}

export interface BuscaApolloResultado {
  decisores:         DecisorApollo[];
  total_bruto:       number;   // quantos o Apollo retornou antes do map/dedupe
  dominio_consultado: string;  // o domínio efetivamente enviado ao Apollo
}

// ─── Mapear pessoa crua do Apollo → DecisorApollo (fiel ao branch básico v3.0) ─
function mapearPessoa(p: any): DecisorApollo {
  return {
    apollo_id:        p.id,
    nome_completo:    p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    primeiro_nome:    p.first_name || '',
    ultimo_nome:      p.last_name || '',
    cargo:            p.title || '',
    email:            p.email || null,
    email_status:     null,
    linkedin_url:     p.linkedin_url || null,
    foto_url:         p.photo_url || null,
    empresa_nome:     p.organization?.name || p.organization_name || '',
    empresa_setor:    null,
    empresa_porte:    null,
    empresa_linkedin: null,
    empresa_website:  null,
    cidade:           p.city || null,
    estado:           p.state || null,
    pais:             p.country || null,
    senioridade:      p.seniority || null,
    departamentos:    p.departments || [],
    fonte:            'apollo',
    enriquecido:      false,
  };
}

// ─── Executa uma chamada de busca no Apollo ─────────────────────────────────
async function executarBusca(params: URLSearchParams, apiKey: string): Promise<any[]> {
  const url = `${APOLLO_BASE_URL}/mixed_people/api_search?${params.toString()}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'no-cache',
      'accept':        'application/json',
      'x-api-key':     apiKey,
    },
  });
  if (!resp.ok) {
    console.error(`❌ [apollo-search] Erro ${resp.status}: ${await resp.text()}`);
    return [];
  }
  const data = await resp.json();
  return [...(data.people || []), ...(data.contacts || [])];
}

/**
 * Busca decisores de UMA empresa no Apollo (grátis).
 *
 * Conta PAGA (20/08/2026): quando filtrar_brasil=true, adiciona person_locations
 * Brazil NA MESMA query do domínio — o Apollo pago filtra país nativamente.
 * Isso vale inclusive para domínios .com (multinacional com operação BR).
 */
export async function buscarDecisoresApollo(p: BuscaApolloParams): Promise<BuscaApolloResultado> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY não configurada');
  if (!p.domain) throw new Error('domain é obrigatório');

  const maxResultados = p.max_resultados ?? 25;
  const pagina        = p.pagina ?? 1;

  // ── Títulos: junta os departamentos pedidos; vazio = todos ──
  const titulos: string[] = [];
  for (const dep of (p.departamentos || [])) {
    const ts = DEPARTAMENTO_TITULOS[dep];
    if (ts) titulos.push(...ts);
  }
  if (titulos.length === 0) {
    titulos.push(...[...new Set(Object.values(DEPARTAMENTO_TITULOS).flat())]);
  }
  const titulosLimitados = titulos.slice(0, MAX_TITULOS);

  // ── Senioridades: mapeia as pedidas; vazio = padrão executivo ──
  const seniorities: string[] = [];
  for (const sen of (p.senioridades || [])) {
    const v = SENIORIDADE_MAP[sen];
    if (v && !seniorities.includes(v)) seniorities.push(v);
  }
  if (seniorities.length === 0) seniorities.push('c_suite', 'vp', 'director', 'manager');

  // ── Query única (domínio base + [opcional] Brasil) ──
  const dominioParaBusca = dominioBase(p.domain);
  const params = new URLSearchParams();
  for (const t of titulosLimitados) params.append('person_titles[]',      t);
  for (const s of seniorities)      params.append('person_seniorities[]', s);
  params.append('q_organization_domains_list[]', dominioParaBusca);
  if (p.filtrar_brasil) {
    for (const loc of BR_LOCATIONS) params.append('person_locations[]', loc);
  }
  params.append('per_page', String(maxResultados));
  params.append('page',     String(pagina));

  const pessoas = await executarBusca(params, apiKey);
  console.log(
    `🔍 [apollo-search] ${p.domain} (→ ${dominioParaBusca})` +
    ` | BR=${p.filtrar_brasil ? 'sim' : 'não'}` +
    ` | ${titulosLimitados.length} títulos | ${pessoas.length} resultados`
  );

  return {
    decisores:          pessoas.map(mapearPessoa),
    total_bruto:        pessoas.length,
    dominio_consultado: dominioParaBusca,
  };
}
