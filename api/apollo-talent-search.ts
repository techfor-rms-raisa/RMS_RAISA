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
 * Versão: 1.0
 * Data: 03/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { searchPeople, ApolloSearchFilters } from './apollo-service';

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
  // Apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    // ============================================
    // 1. EXTRAIR FILTROS DO BODY
    // ============================================
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
      // Dados para log
      user_id,
      vaga_id
    } = req.body;

    // Validação mínima
    const hasFilters = person_titles?.length || q_keywords || person_locations?.length;
    if (!hasFilters) {
      return res.status(400).json({
        success: false,
        error: 'Informe ao menos um filtro: cargo (person_titles), palavras-chave (q_keywords) ou localização (person_locations)'
      });
    }

    // ============================================
    // 2. BUSCAR NO APOLLO (0 créditos)
    // ============================================
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

    console.log(`🎯 [Apollo Talent Search] Busca - user_id: ${user_id}, vaga_id: ${vaga_id || 'N/A'}`);

    const result = await searchPeople(filters);

    if (!result.success) {
      return res.status(502).json({
        success: false,
        error: result.error || 'Erro ao consultar Apollo API'
      });
    }

    // ============================================
    // 3. VERIFICAR DUPLICATAS (linkedin_url na tabela pessoas)
    // ============================================
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
            existentes
              .map((p: any) => p.linkedin_url?.toLowerCase())
              .filter(Boolean)
          );
        }
      } catch (dbError: any) {
        console.warn('⚠️ [Apollo Talent Search] Erro ao verificar duplicatas:', dbError.message);
      }
    }

    // Adicionar flag "ja_importado"
    const peopleWithStatus = result.people.map(person => ({
      ...person,
      ja_importado: person.linkedin_url
        ? existingUrls.has(person.linkedin_url.toLowerCase())
        : false
    }));

    // ============================================
    // 4. REGISTRAR LOG DE USO (0 créditos)
    // ============================================
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
        console.warn('⚠️ [Apollo Talent Search] Erro ao registrar log:', logError.message);
      }
    }

    // ============================================
    // 5. RETORNAR RESULTADOS
    // ============================================
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
