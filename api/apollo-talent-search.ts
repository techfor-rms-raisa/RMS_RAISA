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
 * Versão: 1.1 (self-contained - sem imports externos entre serverless functions)
 * Data: 03/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ============================================
// APOLLO SERVICE (INLINE - evita problemas de import no Vercel)
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
  organization_industry_tag_ids?: string[];
  organization_num_employees_ranges?: string[];
  q_organization_domains?: string[];
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

async function searchPeople(filters: ApolloSearchFilters): Promise<ApolloSearchResponse> {
  try {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
      throw new Error('APOLLO_API_KEY não configurada nas variáveis de ambiente');
    }

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
      organization_industry_tag_ids,
      organization_num_employees_ranges,
      q_organization_domains,
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
      organization_industry_tag_ids: organization_industry_tag_ids || [],
      organization_num_employees_ranges: organization_num_employees_ranges || [],
      q_organization_domains: q_organization_domains || [],
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
