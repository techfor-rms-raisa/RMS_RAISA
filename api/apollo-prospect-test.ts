/**
 * api/apollo-prospect-test.ts
 * 
 * ENDPOINT DE TESTE - Apollo Prospect
 * Valida se conseguimos:
 * 1. Buscar decisores por domínio da empresa (0 créditos)
 * 2. Enriquecer leads para obter email, LinkedIn, nome completo (1 crédito/lead)
 * 
 * CUSTO DO TESTE: ~2 créditos (enriquece apenas 2 leads)
 * 
 * USO: Acessar via navegador:
 * https://rms-raisa-git-preview-techfor.vercel.app/api/apollo-prospect-test?domain=totvs.com.br
 * 
 * Versão: 1.0 (TESTE - remover após validação)
 * Data: 03/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Aceitar GET para facilitar teste no navegador
  const domain = (req.query.domain as string) || (req.body?.domain as string);

  if (!domain) {
    return res.status(200).json({
      instrucoes: 'Adicione ?domain=empresa.com.br na URL',
      exemplo: '/api/apollo-prospect-test?domain=totvs.com.br',
      nota: 'O teste vai consumir ~2 créditos Apollo para enriquecer 2 leads'
    });
  }

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'APOLLO_API_KEY não configurada' });
  }

  const resultado: any = {
    dominio_testado: domain,
    etapa1_busca_gratuita: null,
    etapa2_enriquecimento: [],
    resumo: null
  };

  try {
    // ============================================
    // ETAPA 1: BUSCA GRATUITA (0 créditos)
    // Buscar decisores: Director, Manager, VP, C-Level
    // nos departamentos de TI, Compras, Infraestrutura
    // ============================================

    const searchParams = new URLSearchParams();
    
    // Domínio da empresa
    searchParams.append('q_organization_domains', domain);
    
    // Cargos de decisão
    const cargos = [
      'Diretor', 'Director', 'Gerente', 'Manager',
      'Head', 'VP', 'Vice President', 'CTO', 'CIO',
      'Coordenador', 'Coordinator', 'Superintendente'
    ];
    for (const cargo of cargos) {
      searchParams.append('person_titles[]', cargo);
    }

    // Senioridades de decisão
    for (const sen of ['director', 'vp', 'c_suite', 'manager']) {
      searchParams.append('person_seniorities[]', sen);
    }

    // Máximo 10 resultados para o teste
    searchParams.append('per_page', '10');
    searchParams.append('page', '1');

    console.log(`🔍 [Apollo Test] Etapa 1: Buscando decisores em ${domain}`);

    const searchUrl = `${APOLLO_BASE_URL}/mixed_people/api_search?${searchParams.toString()}`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'accept': 'application/json',
        'x-api-key': apiKey
      }
    });

    if (!searchResponse.ok) {
      const errText = await searchResponse.text();
      resultado.etapa1_busca_gratuita = {
        status: searchResponse.status,
        erro: errText
      };
      return res.status(200).json(resultado);
    }

    const searchData = await searchResponse.json();
    const pessoas = searchData.people || [];

    resultado.etapa1_busca_gratuita = {
      status: 'OK',
      total_encontrados: pessoas.length,
      creditos_consumidos: 0,
      pessoas: pessoas.map((p: any) => ({
        apollo_id: p.id,
        nome: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        first_name: p.first_name,
        last_name: p.last_name,
        titulo: p.title,
        empresa: p.organization?.name || p.organization_name || '',
        linkedin_url: p.linkedin_url || '(vazio)',
        email: p.email || '(vazio)',
        cidade: p.city || '(vazio)',
        pais: p.country || '(vazio)',
        seniority: p.seniority || '(vazio)',
        departamentos: p.departments || []
      }))
    };

    console.log(`✅ [Apollo Test] Etapa 1: ${pessoas.length} decisores encontrados`);

    // ============================================
    // ETAPA 2: ENRIQUECIMENTO (1 crédito/lead)
    // Enriquecer apenas os 2 primeiros para teste
    // ============================================

    const leadsParaEnriquecer = pessoas.slice(0, 2);

    if (leadsParaEnriquecer.length === 0) {
      resultado.etapa2_enriquecimento = [];
      resultado.resumo = {
        conclusao: 'Nenhum decisor encontrado para enriquecer',
        sugestao: 'Tente outro domínio ou cargos mais genéricos'
      };
      return res.status(200).json(resultado);
    }

    for (const lead of leadsParaEnriquecer) {
      console.log(`🔄 [Apollo Test] Etapa 2: Enriquecendo ${lead.first_name} (${lead.id})`);

      try {
        // Tentar enriquecer usando o ID do Apollo + nome + empresa
        const enrichParams = new URLSearchParams();
        enrichParams.append('id', lead.id);
        
        // Também enviar nome e empresa para aumentar chance de match
        if (lead.first_name) enrichParams.append('first_name', lead.first_name);
        if (lead.last_name) enrichParams.append('last_name', lead.last_name);
        if (lead.organization?.name) enrichParams.append('organization_name', lead.organization.name);
        
        // Solicitar email
        enrichParams.append('reveal_personal_emails', 'false');

        const enrichUrl = `${APOLLO_BASE_URL}/people/match?${enrichParams.toString()}`;

        const enrichResponse = await fetch(enrichUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'accept': 'application/json',
            'x-api-key': apiKey
          }
        });

        if (!enrichResponse.ok) {
          const errText = await enrichResponse.text();
          resultado.etapa2_enriquecimento.push({
            apollo_id: lead.id,
            nome_busca: lead.first_name,
            status: 'ERRO',
            http_status: enrichResponse.status,
            erro: errText
          });
          continue;
        }

        const enrichData = await enrichResponse.json();
        const person = enrichData.person || {};

        resultado.etapa2_enriquecimento.push({
          apollo_id: lead.id,
          status: 'OK',
          credito_consumido: 1,
          dados_retornados: {
            nome_completo: person.name || '(vazio)',
            first_name: person.first_name || '(vazio)',
            last_name: person.last_name || '(vazio)',
            email: person.email || '(vazio)',
            email_status: person.email_status || '(vazio)',
            linkedin_url: person.linkedin_url || '(vazio)',
            titulo: person.title || '(vazio)',
            headline: person.headline || '(vazio)',
            foto: person.photo_url || '(vazio)',
            cidade: person.city || '(vazio)',
            estado: person.state || '(vazio)',
            pais: person.country || '(vazio)',
            seniority: person.seniority || '(vazio)',
            departamentos: person.departments || [],
            empresa: {
              nome: person.organization?.name || '(vazio)',
              website: person.organization?.website_url || '(vazio)',
              setor: person.organization?.industry || '(vazio)',
              porte: person.organization?.estimated_num_employees || '(vazio)',
              linkedin: person.organization?.linkedin_url || '(vazio)'
            }
          }
        });

      } catch (enrichErr: any) {
        resultado.etapa2_enriquecimento.push({
          apollo_id: lead.id,
          nome_busca: lead.first_name,
          status: 'EXCEPTION',
          erro: enrichErr.message
        });
      }
    }

    // ============================================
    // RESUMO
    // ============================================

    const enriquecidos = resultado.etapa2_enriquecimento.filter((e: any) => e.status === 'OK');
    const comEmail = enriquecidos.filter((e: any) => e.dados_retornados?.email !== '(vazio)');
    const comLinkedIn = enriquecidos.filter((e: any) => e.dados_retornados?.linkedin_url !== '(vazio)');
    const comNomeCompleto = enriquecidos.filter((e: any) => e.dados_retornados?.last_name !== '(vazio)');

    resultado.resumo = {
      total_decisores_busca: pessoas.length,
      total_enriquecidos: enriquecidos.length,
      creditos_consumidos_teste: enriquecidos.length,
      resultados: {
        com_email: comEmail.length,
        com_linkedin: comLinkedIn.length,
        com_nome_completo: comNomeCompleto.length,
        com_setor_empresa: enriquecidos.filter((e: any) => e.dados_retornados?.empresa?.setor !== '(vazio)').length,
        com_porte_empresa: enriquecidos.filter((e: any) => e.dados_retornados?.empresa?.porte !== '(vazio)').length
      },
      conclusao: comEmail.length > 0
        ? '✅ VIAVEL - Enriquecimento retorna dados completos! Podemos seguir com o desenvolvimento.'
        : '❌ INVIAVEL - Enriquecimento nao retornou emails. Plano pode nao suportar.'
    };

    return res.status(200).json(resultado);

  } catch (error: any) {
    console.error('❌ [Apollo Test] Erro:', error);
    resultado.resumo = { erro: error.message };
    return res.status(200).json(resultado);
  }
}
