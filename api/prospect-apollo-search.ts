/**
 * api/prospect-apollo-search.ts
 * 
 * PROSPECT DUAL ENGINE — Motor Apollo
 * Busca decisores por domínio + enriquece dados completos
 * 
 * Fluxo:
 * 1. Busca gratuita (api_search) → retorna lista de decisores (0 créditos)
 * 2. Enriquecimento (people/match) → dados completos (1 crédito/pessoa)
 * 
 * Versão: 1.0
 * Data: 03/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// ============================================
// MAPEAMENTO DE DEPARTAMENTOS → TÍTULOS APOLLO
// ============================================
const DEPARTAMENTO_TITULOS: Record<string, string[]> = {
    'ti_tecnologia': ['CTO', 'CIO', 'Director of Technology', 'IT Director', 'IT Manager', 'Gerente de TI', 'Diretor de TI', 'Head of IT', 'Head of Technology', 'Gerente de Tecnologia', 'Diretor de Tecnologia'],
    'compras_procurement': ['CPO', 'Procurement Director', 'Purchasing Manager', 'Diretor de Compras', 'Gerente de Compras', 'Head of Procurement', 'Coordenador de Compras', 'Superintendent Compras'],
    'infraestrutura': ['Infrastructure Director', 'Infrastructure Manager', 'Diretor de Infraestrutura', 'Gerente de Infraestrutura', 'Head of Infrastructure', 'Coordenador de Infraestrutura'],
    'governanca_compliance': ['Chief Compliance Officer', 'Governance Director', 'Diretor de Governança', 'Gerente de Governança', 'Compliance Manager', 'Head of Governance', 'Diretor de Compliance'],
    'rh_recursos_humanos': ['CHRO', 'HR Director', 'HR Manager', 'Diretor de RH', 'Gerente de RH', 'Head of HR', 'Head of People', 'Diretor de Pessoas', 'Gerente de Pessoas'],
    'comercial_vendas': ['CSO', 'Sales Director', 'Sales Manager', 'Diretor Comercial', 'Gerente Comercial', 'Head of Sales', 'VP de Vendas', 'VP Comercial'],
    'financeiro': ['CFO', 'Finance Director', 'Finance Manager', 'Diretor Financeiro', 'Gerente Financeiro', 'Head of Finance', 'Controller'],
    'diretoria_clevel': ['CEO', 'COO', 'CTO', 'CFO', 'CIO', 'CHRO', 'CSO', 'CPO', 'President', 'Presidente', 'Vice President', 'VP', 'Managing Director', 'Diretor Geral']
};

// ============================================
// MAPEAMENTO DE SENIORIDADE → APOLLO VALUES
// ============================================
const SENIORIDADE_MAP: Record<string, string> = {
    'c_level': 'c_suite',
    'vp': 'vp',
    'diretor': 'director',
    'gerente': 'manager',
    'coordenador': 'manager',
    'superintendente': 'director'
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido. Use POST.' });
    }

    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'APOLLO_API_KEY não configurada' });
    }

    const { 
        domain, 
        departamentos = [], 
        senioridades = [],
        enriquecer = false,
        max_resultados = 25,
        pagina = 1
    } = req.body;

    if (!domain) {
        return res.status(400).json({ error: 'Campo "domain" é obrigatório' });
    }

    try {
        // ============================================
        // ETAPA 1: BUSCA GRATUITA (0 créditos)
        // ============================================
        const searchParams = new URLSearchParams();
        searchParams.append('q_organization_domains', domain);

        // Montar títulos baseados nos departamentos selecionados
        const titulos: string[] = [];
        for (const dep of departamentos) {
            const depTitulos = DEPARTAMENTO_TITULOS[dep];
            if (depTitulos) {
                titulos.push(...depTitulos);
            }
        }

        // Se nenhum departamento selecionado, buscar cargos genéricos de decisão
        if (titulos.length === 0) {
            const todosOsTitulos = Object.values(DEPARTAMENTO_TITULOS).flat();
            // Remover duplicatas
            const titulosUnicos = [...new Set(todosOsTitulos)];
            titulos.push(...titulosUnicos);
        }

        for (const titulo of titulos) {
            searchParams.append('person_titles[]', titulo);
        }

        // Senioridades
        const seniorities: string[] = [];
        for (const sen of senioridades) {
            const apolloSen = SENIORIDADE_MAP[sen];
            if (apolloSen && !seniorities.includes(apolloSen)) {
                seniorities.push(apolloSen);
            }
        }
        
        // Se nenhuma senioridade selecionada, buscar todas de decisão
        if (seniorities.length === 0) {
            seniorities.push('c_suite', 'vp', 'director', 'manager');
        }

        for (const sen of seniorities) {
            searchParams.append('person_seniorities[]', sen);
        }

        searchParams.append('per_page', String(max_resultados));
        searchParams.append('page', String(pagina));

        console.log(`🔍 [Apollo Prospect] Buscando decisores em ${domain} | Departamentos: ${departamentos.join(', ') || 'todos'}`);

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
            console.error(`❌ [Apollo Prospect] Erro busca: ${searchResponse.status} - ${errText}`);
            return res.status(200).json({ 
                success: false, 
                error: `Apollo API erro: ${searchResponse.status}`,
                detalhes: errText
            });
        }

        const searchData = await searchResponse.json();
        const pessoas = searchData.people || [];

        console.log(`✅ [Apollo Prospect] ${pessoas.length} decisores encontrados em ${domain}`);

        // Se não precisa enriquecer, retornar dados básicos
        if (!enriquecer) {
            const resultados = pessoas.map((p: any) => ({
                apollo_id: p.id,
                nome_completo: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                primeiro_nome: p.first_name || '',
                ultimo_nome: p.last_name || '',
                cargo: p.title || '',
                email: p.email || null,
                email_status: null,
                linkedin_url: p.linkedin_url || null,
                foto_url: p.photo_url || null,
                empresa_nome: p.organization?.name || p.organization_name || '',
                empresa_setor: null,
                empresa_porte: null,
                empresa_linkedin: null,
                empresa_website: null,
                cidade: p.city || null,
                estado: p.state || null,
                pais: p.country || null,
                senioridade: p.seniority || null,
                departamentos: p.departments || [],
                fonte: 'apollo',
                enriquecido: false
            }));

            return res.status(200).json({
                success: true,
                motor: 'apollo',
                dominio: domain,
                total: resultados.length,
                creditos_consumidos: 0,
                resultados
            });
        }

        // ============================================
        // ETAPA 2: ENRIQUECIMENTO (1 crédito/pessoa)
        // ============================================
        const resultadosEnriquecidos = [];
        let creditosConsumidos = 0;

        for (const lead of pessoas) {
            try {
                const enrichParams = new URLSearchParams();
                enrichParams.append('id', lead.id);
                if (lead.first_name) enrichParams.append('first_name', lead.first_name);
                if (lead.last_name) enrichParams.append('last_name', lead.last_name);
                if (lead.organization?.name) enrichParams.append('organization_name', lead.organization.name);
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

                if (enrichResponse.ok) {
                    const enrichData = await enrichResponse.json();
                    const person = enrichData.person || {};
                    creditosConsumidos++;

                    resultadosEnriquecidos.push({
                        apollo_id: lead.id,
                        nome_completo: person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim(),
                        primeiro_nome: person.first_name || lead.first_name || '',
                        ultimo_nome: person.last_name || lead.last_name || '',
                        cargo: person.title || lead.title || '',
                        email: person.email || null,
                        email_status: person.email_status || null,
                        linkedin_url: person.linkedin_url || null,
                        foto_url: person.photo_url || null,
                        empresa_nome: person.organization?.name || lead.organization?.name || '',
                        empresa_setor: person.organization?.industry || null,
                        empresa_porte: person.organization?.estimated_num_employees || null,
                        empresa_linkedin: person.organization?.linkedin_url || null,
                        empresa_website: person.organization?.website_url || null,
                        cidade: person.city || null,
                        estado: person.state || null,
                        pais: person.country || null,
                        senioridade: person.seniority || null,
                        departamentos: person.departments || [],
                        fonte: 'apollo',
                        enriquecido: true
                    });
                } else {
                    // Falhou enriquecimento, retornar dados básicos
                    resultadosEnriquecidos.push({
                        apollo_id: lead.id,
                        nome_completo: lead.name || lead.first_name || '',
                        primeiro_nome: lead.first_name || '',
                        ultimo_nome: lead.last_name || '',
                        cargo: lead.title || '',
                        email: null,
                        email_status: null,
                        linkedin_url: null,
                        foto_url: null,
                        empresa_nome: lead.organization?.name || '',
                        empresa_setor: null,
                        empresa_porte: null,
                        empresa_linkedin: null,
                        empresa_website: null,
                        cidade: null,
                        estado: null,
                        pais: null,
                        senioridade: null,
                        departamentos: [],
                        fonte: 'apollo',
                        enriquecido: false
                    });
                }
            } catch (enrichErr: any) {
                console.error(`⚠️ [Apollo Prospect] Erro enriquecendo ${lead.first_name}: ${enrichErr.message}`);
                // Continuar com próximo lead
                resultadosEnriquecidos.push({
                    apollo_id: lead.id,
                    nome_completo: lead.name || lead.first_name || '',
                    primeiro_nome: lead.first_name || '',
                    ultimo_nome: lead.last_name || '',
                    cargo: lead.title || '',
                    email: null,
                    email_status: null,
                    linkedin_url: null,
                    foto_url: null,
                    empresa_nome: lead.organization?.name || '',
                    empresa_setor: null,
                    empresa_porte: null,
                    empresa_linkedin: null,
                    empresa_website: null,
                    cidade: null,
                    estado: null,
                    pais: null,
                    senioridade: null,
                    departamentos: [],
                    fonte: 'apollo',
                    enriquecido: false
                });
            }
        }

        console.log(`✅ [Apollo Prospect] Enriquecidos: ${creditosConsumidos}/${pessoas.length} | Créditos: ${creditosConsumidos}`);

        return res.status(200).json({
            success: true,
            motor: 'apollo',
            dominio: domain,
            total: resultadosEnriquecidos.length,
            creditos_consumidos: creditosConsumidos,
            resultados: resultadosEnriquecidos
        });

    } catch (error: any) {
        console.error('❌ [Apollo Prospect] Erro:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}
