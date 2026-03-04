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
 * Versão: 2.0
 * Data: 04/03/2026
 * 
 * FIX v2.0:
 * - DEPARTAMENTO_TITULOS expandido: cargos PT-BR + EN + variações regionais
 * - Filtro person_locations Brasil quando filtrar_brasil=true
 * - q_organization_domains_list[] (array) em vez de string
 * - Senioridades mapeadas corretamente incluindo "coordenador" e "superintendente"
 * - Limite de 25 títulos por requisição (evita URL muito longa)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// ============================================
// DEPARTAMENTOS → TÍTULOS APOLLO (PT-BR + EN)
// Máximo 25 títulos por busca — priorizados por relevância
// ============================================
const DEPARTAMENTO_TITULOS: Record<string, string[]> = {
    ti_tecnologia: [
        // C-Level / Diretoria
        'CTO', 'CIO', 'Chief Technology Officer', 'Chief Information Officer',
        'Diretor de TI', 'Diretor de Tecnologia', 'Diretor de Sistemas',
        'IT Director', 'Director of Technology', 'Director of Information Technology',
        'VP of Technology', 'VP of Engineering', 'Head of Technology', 'Head of IT',
        // Gerência
        'Gerente de TI', 'Gerente de Tecnologia', 'Gerente de Sistemas',
        'Gerente de Infraestrutura de TI', 'IT Manager', 'Technology Manager',
        'Information Technology Manager', 'Systems Manager',
        // Coordenação / Supervisão
        'Coordenador de TI', 'Coordenador de Tecnologia', 'Supervisor de TI',
        'IT Coordinator', 'Technology Lead', 'Tech Lead',
        // Especialistas sênior
        'Arquiteto de Soluções', 'Arquiteto de TI', 'Solutions Architect',
        'Enterprise Architect', 'IT Architect',
        'Analista de TI Sênior', 'Senior IT Analyst',
    ],
    infraestrutura: [
        // Diretoria
        'Diretor de Infraestrutura', 'Director of Infrastructure',
        'Head of Infrastructure', 'VP of Infrastructure',
        // Gerência
        'Gerente de Infraestrutura', 'Infrastructure Manager',
        'Gerente de Datacenter', 'Gerente de Redes', 'Network Manager',
        'Gerente de Operações de TI', 'IT Operations Manager',
        // Coordenação
        'Coordenador de Infraestrutura', 'Infrastructure Coordinator',
        'Supervisor de Infraestrutura', 'Network Administrator',
        // Especialistas
        'System Administrator', 'Systems Administrator', 'Sysadmin',
        'Administrador de Sistemas', 'Administrador de Redes',
        'Cloud Engineer', 'Cloud Architect', 'DevOps Engineer',
        'Security Engineer', 'Cybersecurity Manager',
    ],
    compras_procurement: [
        'CPO', 'Chief Procurement Officer',
        'Diretor de Compras', 'Diretor de Suprimentos',
        'Procurement Director', 'Director of Procurement', 'Purchasing Director',
        'Head of Procurement', 'Head of Purchasing', 'VP of Procurement',
        'Gerente de Compras', 'Gerente de Suprimentos', 'Gerente de Procurement',
        'Purchasing Manager', 'Procurement Manager', 'Supply Chain Manager',
        'Coordenador de Compras', 'Coordenador de Suprimentos',
        'Superintendente de Compras', 'Category Manager',
    ],
    governanca_compliance: [
        'CCO', 'Chief Compliance Officer', 'Chief Risk Officer',
        'Diretor de Governança', 'Diretor de Compliance', 'Diretor de Riscos',
        'Governance Director', 'Compliance Director', 'Risk Director',
        'Head of Compliance', 'Head of Governance', 'Head of Risk',
        'Gerente de Compliance', 'Gerente de Governança', 'Gerente de Riscos',
        'Compliance Manager', 'Risk Manager', 'Governance Manager',
        'DPO', 'Data Protection Officer',
        'Coordenador de Compliance', 'Auditor Sênior',
    ],
    rh_recursos_humanos: [
        'CHRO', 'Chief Human Resources Officer', 'Chief People Officer',
        'Diretor de RH', 'Diretor de Recursos Humanos', 'Diretor de Pessoas',
        'HR Director', 'People Director', 'Director of Human Resources',
        'Head of HR', 'Head of People', 'VP of HR', 'VP of People',
        'Gerente de RH', 'Gerente de Recursos Humanos', 'Gerente de Pessoas',
        'HR Manager', 'People Manager', 'Human Resources Manager',
        'Coordenador de RH', 'HR Coordinator',
        'Talent Acquisition Manager', 'Gerente de T&D',
    ],
    comercial_vendas: [
        'CSO', 'Chief Sales Officer', 'Chief Revenue Officer', 'CRO',
        'Diretor Comercial', 'Diretor de Vendas', 'Sales Director',
        'Head of Sales', 'Head of Commercial', 'VP de Vendas', 'VP of Sales',
        'Gerente Comercial', 'Gerente de Vendas', 'Sales Manager',
        'Commercial Manager', 'Account Manager', 'Business Development Manager',
        'Coordenador Comercial', 'Sales Coordinator',
    ],
    financeiro: [
        'CFO', 'Chief Financial Officer',
        'Diretor Financeiro', 'Diretor de Finanças', 'Finance Director',
        'Head of Finance', 'VP of Finance', 'VP Financeiro',
        'Gerente Financeiro', 'Gerente de Finanças', 'Finance Manager',
        'Controller', 'Financial Controller', 'Controladoria',
        'Coordenador Financeiro', 'Superintendent Financeiro',
        'CFP', 'FP&A Manager', 'Treasury Manager', 'Gerente de Tesouraria',
    ],
    diretoria_clevel: [
        'CEO', 'COO', 'CTO', 'CFO', 'CIO', 'CHRO', 'CSO', 'CPO', 'CRO',
        'President', 'Presidente', 'Presidente Executivo',
        'Managing Director', 'Diretor Geral', 'Diretor Executivo',
        'Vice President', 'VP', 'Vice-Presidente',
        'Country Manager', 'General Manager', 'Gerente Geral',
        'C-Level', 'Executive Director',
    ],
};

// ============================================
// SENIORIDADE → VALORES APOLLO
// ============================================
const SENIORIDADE_MAP: Record<string, string> = {
    'c_level':       'c_suite',
    'vp':            'vp',
    'diretor':       'director',
    'gerente':       'manager',
    'coordenador':   'manager',   // Apollo não tem "coordinator", mapeia para manager
    'superintendente': 'director', // Mapeia para director
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
        departamentos    = [], 
        senioridades     = [],
        enriquecer       = false,
        max_resultados   = 25,
        pagina           = 1,
        filtrar_brasil   = false   // novo: filtra person_locations para Brasil
    } = req.body;

    if (!domain) {
        return res.status(400).json({ error: 'Campo "domain" é obrigatório' });
    }

    try {
        // ============================================
        // ETAPA 1: BUSCA GRATUITA (0 créditos)
        // ============================================

        // Montar títulos pelos departamentos selecionados
        // Máximo de 25 títulos para evitar URL excessivamente longa
        const MAX_TITULOS = 25;
        let titulos: string[] = [];

        if (departamentos.length > 0) {
            for (const dep of departamentos) {
                const depTitulos = DEPARTAMENTO_TITULOS[dep];
                if (depTitulos) titulos.push(...depTitulos);
            }
            // Remover duplicatas e limitar
            titulos = [...new Set(titulos)].slice(0, MAX_TITULOS);
        } else {
            // Sem filtro: usar os títulos de todos os departamentos mas apenas C-Level/Dir
            titulos = [
                'CEO', 'COO', 'CTO', 'CFO', 'CIO', 'CHRO',
                'Diretor', 'Director', 'Head of', 'VP', 'Vice President',
                'Managing Director', 'Gerente Geral', 'Country Manager',
            ];
        }

        // Senioridades Apollo
        const seniorities: string[] = [];
        for (const sen of senioridades) {
            const apolloSen = SENIORIDADE_MAP[sen];
            if (apolloSen && !seniorities.includes(apolloSen)) {
                seniorities.push(apolloSen);
            }
        }
        if (seniorities.length === 0) {
            seniorities.push('c_suite', 'vp', 'director', 'manager');
        }

        // Montar query params
        const searchParams = new URLSearchParams();

        // Domínio como array (mais preciso)
        searchParams.append('q_organization_domains_list[]', domain);

        for (const titulo of titulos) {
            searchParams.append('person_titles[]', titulo);
        }
        for (const sen of seniorities) {
            searchParams.append('person_seniorities[]', sen);
        }

        // Filtro geográfico Brasil — quando solicitado
        if (filtrar_brasil) {
            const BRASIL_LOCATIONS = ['Brazil', 'Brasil', 'São Paulo, Brazil', 'Rio de Janeiro, Brazil'];
            for (const loc of BRASIL_LOCATIONS) {
                searchParams.append('person_locations[]', loc);
            }
            console.log('🌎 [Apollo Prospect] Filtro geográfico: Brasil');
        }

        searchParams.append('per_page', String(Math.min(max_resultados, 100)));
        searchParams.append('page', String(pagina));

        console.log(`🔍 [Apollo Prospect] Domínio: ${domain} | Depts: ${departamentos.join(', ') || 'todos'} | ${titulos.length} títulos | Seniorities: ${seniorities.join(', ')}`);

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
            console.error(`❌ [Apollo Prospect] Erro busca: ${searchResponse.status} - ${errText.substring(0, 200)}`);
            return res.status(200).json({ 
                success: false, 
                error: `Apollo API erro: ${searchResponse.status}`,
                detalhes: errText.substring(0, 200)
            });
        }

        const searchData = await searchResponse.json();
        const pessoas = searchData.people || [];

        console.log(`✅ [Apollo Prospect] ${pessoas.length}/${searchData.total_entries || '?'} decisores encontrados em ${domain}`);

        // Sem enriquecimento → retornar dados básicos
        if (!enriquecer) {
            const resultados = pessoas.map((p: any) => ({
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
                fonte:            'apollo' as const,
                enriquecido:      false
            }));

            return res.status(200).json({
                success: true,
                motor: 'apollo',
                dominio: domain,
                total: resultados.length,
                total_disponivel: searchData.total_entries || resultados.length,
                creditos_consumidos: 0,
                resultados
            });
        }

        // ============================================
        // ETAPA 2: ENRIQUECIMENTO (1 crédito/pessoa)
        // Paralelo com limite de concorrência para respeitar rate limit
        // ============================================
        const CONCURRENCY = 5;
        const resultadosEnriquecidos: any[] = [];
        let creditosConsumidos = 0;

        const enriquecerUm = async (lead: any): Promise<any> => {
            try {
                const enrichParams = new URLSearchParams();
                if (lead.id) enrichParams.append('id', lead.id);
                if (lead.first_name) enrichParams.append('first_name', lead.first_name);
                if (lead.last_name)  enrichParams.append('last_name', lead.last_name);
                if (lead.organization?.name) enrichParams.append('organization_name', lead.organization.name);
                enrichParams.append('reveal_personal_emails', 'false');
                enrichParams.append('domain', domain);

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
                    return {
                        apollo_id:        lead.id,
                        nome_completo:    person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim(),
                        primeiro_nome:    person.first_name || lead.first_name || '',
                        ultimo_nome:      person.last_name  || lead.last_name  || '',
                        cargo:            person.title      || lead.title      || '',
                        email:            person.email      || null,
                        email_status:     person.email_status || null,
                        linkedin_url:     person.linkedin_url || null,
                        foto_url:         person.photo_url    || null,
                        empresa_nome:     person.organization?.name                    || lead.organization?.name || '',
                        empresa_setor:    person.organization?.industry                 || null,
                        empresa_porte:    person.organization?.estimated_num_employees  || null,
                        empresa_linkedin: person.organization?.linkedin_url             || null,
                        empresa_website:  person.organization?.website_url              || null,
                        cidade:           person.city    || null,
                        estado:           person.state   || null,
                        pais:             person.country || null,
                        senioridade:      person.seniority    || null,
                        departamentos:    person.departments  || [],
                        fonte:            'apollo' as const,
                        enriquecido:      true
                    };
                }
            } catch (enrichErr: any) {
                console.warn(`⚠️ [Apollo Prospect] Erro enriquecendo ${lead.first_name}: ${enrichErr.message}`);
            }

            // Fallback: dados básicos sem enriquecimento
            return {
                apollo_id:  lead.id,
                nome_completo: lead.name || lead.first_name || '',
                primeiro_nome: lead.first_name || '',
                ultimo_nome:   lead.last_name  || '',
                cargo:         lead.title      || '',
                email: null, email_status: null, linkedin_url: null, foto_url: null,
                empresa_nome:     lead.organization?.name || '',
                empresa_setor: null, empresa_porte: null, empresa_linkedin: null, empresa_website: null,
                cidade: null, estado: null, pais: null, senioridade: null, departamentos: [],
                fonte: 'apollo' as const, enriquecido: false
            };
        };

        // Processar em lotes de CONCURRENCY
        for (let i = 0; i < pessoas.length; i += CONCURRENCY) {
            const lote = pessoas.slice(i, i + CONCURRENCY);
            const loteResults = await Promise.all(lote.map(enriquecerUm));
            resultadosEnriquecidos.push(...loteResults);
        }

        console.log(`✅ [Apollo Prospect] Enriquecidos: ${creditosConsumidos}/${pessoas.length} | Créditos: ${creditosConsumidos}`);

        return res.status(200).json({
            success: true,
            motor: 'apollo',
            dominio: domain,
            total: resultadosEnriquecidos.length,
            total_disponivel: searchData.total_entries || resultadosEnriquecidos.length,
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
