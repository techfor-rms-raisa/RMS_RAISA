/**
 * api/apollo-talent-search.ts
 * 
 * Endpoint para busca de candidatos via Apollo People API Search
 * Usado pelo módulo Apollo Talent Finder (R&S) no LinkedInImportPanel
 * 
 * CUSTO: 0 créditos (People API Search é gratuito)
 * RETORNA: nome, cargo, empresa, LinkedIn URL, foto, localização
 * NÃO RETORNA: email, telefone
 * 
 * IMPORTANTE: O endpoint api_search recebe parâmetros via QUERY STRING,
 * não via JSON body (conforme documentação Apollo atualizada)
 * Ref: https://docs.apollo.io/reference/people-api-search
 * 
 * Versão: 1.2
 * Data: 03/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ============================================
// APOLLO SERVICE (INLINE)
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

function mapSeniority(seniority: string): string {
  return SENIORITY_MAP[seniority] || seniority.toLowerCase();
}

interface ApolloSearchFilters {
  person_titles?: string[];
  person_seniorities?: string[];
  person_locations?: string[];
  q_keywords?: string;
  organization_num_employees_ranges?: string[];
  page?: number;
  per_page?: number;
}

interface ApolloPersonResult {
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

interface ApolloSearchResponse {
  success: boolean;
  people: ApolloPersonResult[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
  credits_consumed: number;
  error?: string;
}

/**
 * Busca pessoas via Apollo People API Search
 * 
 * IMPORTANTE: O endpoint api_search usa QUERY STRING, não JSON body
 * Formato: person_titles[]=value1&person_titles[]=value2
 */
async function searchPeople(filters: ApolloSearchFilters): Promise<ApolloSearchResponse> {
  try {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
      throw new Error('APOLLO_API_KEY não configurada nas variáveis de ambiente');
    }

    // Montar query string (formato array: param[]=value)
    const params = new URLSearchParams();

    // Títulos/Cargos
    if (filters.person_titles?.length) {
      for (const title of filters.person_titles) {
        if (title.trim()) {
          params.append('person_titles[]', title.trim());
        }
      }
    }

    // Senioridade
    if (filters.person_seniorities?.length) {
      for (const sen of filters.person_seniorities) {
        if (sen.trim()) {
          params.append('person_seniorities[]', mapSeniority(sen.trim()));
        }
      }
    }

    // Localização
    if (filters.person_locations?.length) {
      for (const loc of filters.person_locations) {
        if (loc.trim()) {
          params.append('person_locations[]', loc.trim());
        }
      }
    }

    // Keywords
    if (filters.q_keywords?.trim()) {
      params.append('q_keywords', filters.q_keywords.trim());
    }

    // Tamanho da empresa
    if (filters.organization_num_employees_ranges?.length) {
      for (const range of filters.organization_num_employees_ranges) {
        if (range.trim()) {
          params.append('organization_num_employees_ranges[]', range.trim());
        }
      }
    }

    // Paginação
    params.append('page', String(filters.page || 1));
    params.append('per_page', String(Math.min(filters.per_page || 25, 100)));

    const url = `${APOLLO_BASE_URL}/mixed_people/api_search?${params.toString()}`;

    console.log('🔍 [Apollo Service] People API Search URL:', url.replace(apiKey, '***'));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'accept': 'application/json',
        'x-api-key': apiKey
      }
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

    const pagination = {
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

// ============================================
// SUPABASE ADMIN CLIENT
// ============================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

// ============================================
// HANDLER
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const {
      person_titles,
      person_seniorities,
      person_locations,
      q_keywords,
      organization_num_employees_ranges,
      page = 1,
      per_page = 25,
      user_id,
      vaga_id
    } = req.body;

    const hasFilters = person_titles?.length || q_keywords || person_locations?.length;
    if (!hasFilters) {
      return res.status(400).json({
        success: false,
        error: 'Informe ao menos um filtro: cargo, palavras-chave ou localização'
      });
    }

    // BUSCAR NO APOLLO (0 créditos)
    const filters: ApolloSearchFilters = {
      person_titles: person_titles || [],
      person_seniorities: person_seniorities || [],
      person_locations: person_locations || ['Brazil'],
      q_keywords: q_keywords || '',
      organization_num_employees_ranges: organization_num_employees_ranges || [],
      page,
      per_page: Math.min(per_page, 100)
    };

    console.log(`🎯 [Apollo Talent Search] user_id: ${user_id}, vaga_id: ${vaga_id || 'N/A'}`);

    const result = await searchPeople(filters);

    if (!result.success) {
      return res.status(502).json({
        success: false,
        error: result.error || 'Erro ao consultar Apollo API'
      });
    }

    // VERIFICAR DUPLICATAS
    const linkedinUrls = result.people
      .map(p => p.linkedin_url)
      .filter(url => url && url.length > 0);

    let existingUrls: Set<string> = new Set();

    if (linkedinUrls.length > 0) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: existentes } = await supabase
          .from('pessoas')
          .select('linkedin_url')
          .in('linkedin_url', linkedinUrls)
          .eq('ativo', true);

        if (existentes) {
          existingUrls = new Set(
            existentes.map((p: any) => p.linkedin_url?.toLowerCase()).filter(Boolean)
          );
        }
      } catch (dbError: any) {
        console.warn('⚠️ Erro ao verificar duplicatas:', dbError.message);
      }
    }

    const peopleWithStatus = result.people.map(person => ({
      ...person,
      ja_importado: person.linkedin_url
        ? existingUrls.has(person.linkedin_url.toLowerCase())
        : false
    }));

    // REGISTRAR LOG (0 créditos)
    if (user_id) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase.from('apollo_credit_usage').insert({
          user_id: parseInt(user_id),
          modulo: 'talent',
          action: 'search',
          credits_used: 0,
          prospects_count: result.people.length,
          details_json: {
            filters: { person_titles, person_seniorities, person_locations, q_keywords },
            vaga_id: vaga_id || null,
            total_results: result.pagination.total_entries,
            page
          }
        });
      } catch (logError: any) {
        console.warn('⚠️ Erro ao registrar log:', logError.message);
      }
    }

    return res.status(200).json({
      success: true,
      people: peopleWithStatus,
      pagination: result.pagination,
      credits_consumed: 0,
      duplicates_found: existingUrls.size
    });

  } catch (error: any) {
    console.error('❌ [Apollo Talent Search] Erro:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    });
  }
}
