/**
 * api/apollo-service.ts
 * 
 * Serviço centralizado para chamadas à API Apollo.io
 * Usado por: Apollo Talent Finder (R&S) e Apollo Prospect (Comercial)
 * 
 * - Encapsula chamadas à API Apollo
 * - Centraliza API Key (env var APOLLO_API_KEY)
 * - Tratamento de erros padronizado
 * - Mapeamentos BR → Apollo (senioridade, estados)
 * 
 * Versão: 1.0
 * Data: 03/03/2026
 */

// ============================================
// TIPOS
// ============================================

export interface ApolloPersonResult {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  headline?: string;
  linkedin_url: string;
  photo_url?: string;
  organization_name?: string;
  organization?: {
    name?: string;
    website_url?: string;
    industry?: string;
    estimated_num_employees?: number;
    linkedin_url?: string;
  };
  city?: string;
  state?: string;
  country?: string;
  departments?: string[];
  seniority?: string;
}

export interface ApolloPagination {
  page: number;
  per_page: number;
  total_entries: number;
  total_pages: number;
}

export interface ApolloSearchResponse {
  success: boolean;
  people: ApolloPersonResult[];
  pagination: ApolloPagination;
  credits_consumed: number;
  error?: string;
}

export interface ApolloSearchFilters {
  person_titles?: string[];
  person_seniorities?: string[];
  person_locations?: string[];
  q_keywords?: string;
  organization_industry_tag_ids?: string[];
  organization_num_employees_ranges?: string[];
  q_organization_domains?: string[];
  page?: number;
  per_page?: number;
}

// ============================================
// CONSTANTES
// ============================================

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

const SENIORITY_MAP: Record<string, string> = {
  'Junior': 'entry',
  'Pleno': 'senior',
  'Senior': 'senior',
  'Especialista': 'manager',
  'Gestão': 'director',
  'C-Level': 'c_suite',
  'entry': 'entry',
  'senior': 'senior',
  'manager': 'manager',
  'director': 'director',
  'vp': 'vp',
  'c_suite': 'c_suite',
  'owner': 'owner'
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function getApiKey(): string {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY não configurada nas variáveis de ambiente');
  }
  return apiKey;
}

export function mapSeniority(seniority: string): string {
  return SENIORITY_MAP[seniority] || seniority.toLowerCase();
}

// ============================================
// PEOPLE API SEARCH (0 créditos)
// ============================================

export async function searchPeople(filters: ApolloSearchFilters): Promise<ApolloSearchResponse> {
  try {
    const apiKey = getApiKey();

    const body: Record<string, any> = {
      page: filters.page || 1,
      per_page: Math.min(filters.per_page || 25, 100)
    };

    if (filters.person_titles?.length) {
      body.person_titles = filters.person_titles;
    }
    if (filters.person_seniorities?.length) {
      body.person_seniorities = filters.person_seniorities.map(s => mapSeniority(s));
    }
    if (filters.person_locations?.length) {
      body.person_locations = filters.person_locations;
    }
    if (filters.q_keywords) {
      body.q_keywords = filters.q_keywords;
    }
    if (filters.organization_industry_tag_ids?.length) {
      body.organization_industry_tag_ids = filters.organization_industry_tag_ids;
    }
    if (filters.organization_num_employees_ranges?.length) {
      body.organization_num_employees_ranges = filters.organization_num_employees_ranges;
    }
    if (filters.q_organization_domains?.length) {
      body.q_organization_domains = filters.q_organization_domains.join('\n');
    }

    console.log('🔍 [Apollo Service] People Search:', JSON.stringify(body, null, 2));

    const response = await fetch(`${APOLLO_BASE_URL}/mixed_people/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Apollo Service] Erro ${response.status}:`, errorText);
      throw new Error(`Apollo API retornou status ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    const people: ApolloPersonResult[] = (data.people || []).map((p: any) => ({
      id: p.id || '',
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      title: p.title || '',
      headline: p.headline || '',
      linkedin_url: p.linkedin_url || '',
      photo_url: p.photo_url || '',
      organization_name: p.organization?.name || p.organization_name || '',
      organization: p.organization ? {
        name: p.organization.name,
        website_url: p.organization.website_url,
        industry: p.organization.industry,
        estimated_num_employees: p.organization.estimated_num_employees,
        linkedin_url: p.organization.linkedin_url
      } : undefined,
      city: p.city || '',
      state: p.state || '',
      country: p.country || '',
      departments: p.departments || [],
      seniority: p.seniority || ''
    }));

    const pagination: ApolloPagination = {
      page: data.pagination?.page || filters.page || 1,
      per_page: data.pagination?.per_page || filters.per_page || 25,
      total_entries: data.pagination?.total_entries || 0,
      total_pages: data.pagination?.total_pages || 0
    };

    console.log(`✅ [Apollo Service] ${people.length} resultados (total: ${pagination.total_entries})`);

    return { success: true, people, pagination, credits_consumed: 0 };

  } catch (error: any) {
    console.error('❌ [Apollo Service] Erro na busca:', error.message);
    return {
      success: false,
      people: [],
      pagination: { page: 1, per_page: 25, total_entries: 0, total_pages: 0 },
      credits_consumed: 0,
      error: error.message
    };
  }
}
