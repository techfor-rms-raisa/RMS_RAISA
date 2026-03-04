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
 * Versão: 2.8
 * Data: 04/03/2026
 *
 * CORREÇÕES v2.8 — Estratégia dupla query para filtro Brasil:
 * PROBLEMA RAIZ: domínio base (carrefour.com) retorna funcionários de 30+ países.
 *   Ex: carrefour.com.br → extrai carrefour.com → traz Eric Xu (China), Ahmed Ragab (Egito)
 * SOLUÇÃO: duas queries independentes + interseção por ID
 *   Query A: por domínio completo .com.br (sem location)
 *   Query B: person_locations[]=São Paulo, Brazil (sem domínio)
 *   Interseção: IDs que aparecem em ambas → garantidamente BR + empresa correta
 * Se domínio NÃO termina em .com.br: busca simples sem interseção
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// ============================================
// MAPEAMENTO DE DEPARTAMENTOS → TÍTULOS APOLLO
// ============================================
// Limite de títulos por request (evitar query string excessiva)
const MAX_TITULOS = 25;

const DEPARTAMENTO_TITULOS: Record<string, string[]> = {
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

// ─── Verifica se domínio é ccTLD brasileiro ─────────────────────────────────
function isDominioBR(domain: string): boolean {
    return domain.toLowerCase().trim().endsWith('.com.br')
        || domain.toLowerCase().trim().endsWith('.org.br')
        || domain.toLowerCase().trim().endsWith('.net.br')
        || domain.toLowerCase().trim().endsWith('.gov.br');
}

// ─── Localidades BR para person_locations ────────────────────────────────────
// Apollo aceita cidade+país ou só país no formato "Cidade, Estado, País" ou "País"
const BR_LOCATIONS = [
    'São Paulo, São Paulo, Brazil',
    'Rio de Janeiro, Rio de Janeiro, Brazil',
    'Belo Horizonte, Minas Gerais, Brazil',
    'Brasília, Federal District, Brazil',
    'Brazil',
];

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
        filtrar_brasil = false,
        max_resultados = 25,
        pagina = 1
    } = req.body;

    if (!domain) {
        return res.status(400).json({ error: 'Campo "domain" é obrigatório' });
    }

    try {
        // ============================================
        // ETAPA 1: BUSCA (0 créditos)
        // Estratégia dupla query para domínios .com.br:
        //   Query A: por domínio .com.br exato → traz todos na empresa
        //   Query B: por person_locations[]=Brazil → traz todos no Brasil
        //   Interseção por ID → apenas quem está na empresa E no Brasil
        // Para domínios não-BR: query simples sem interseção
        // ============================================

        // ── Construtor de query reutilizável ──────────────────
        async function executarBusca(params: URLSearchParams): Promise<any[]> {
            const url = `${APOLLO_BASE_URL}/mixed_people/api_search?${params.toString()}`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json', 'Cache-Control': 'no-cache',
                    'accept': 'application/json', 'x-api-key': apiKey,
                },
            });
            if (!resp.ok) {
                console.error(`❌ [Apollo] Erro ${resp.status}: ${await resp.text()}`);
                return [];
            }
            const data = await resp.json();
            return [...(data.people || []), ...(data.contacts || [])];
        }

        // ── Títulos e senioridades ────────────────────────────
        const titulos: string[] = [];
        for (const dep of departamentos) {
            const ts = DEPARTAMENTO_TITULOS[dep];
            if (ts) titulos.push(...ts);
        }
        if (titulos.length === 0) {
            titulos.push(...[...new Set(Object.values(DEPARTAMENTO_TITULOS).flat())]);
        }
        const titulosLimitados = titulos.slice(0, MAX_TITULOS);

        const seniorities: string[] = [];
        for (const sen of senioridades) {
            const v = SENIORIDADE_MAP[sen];
            if (v && !seniorities.includes(v)) seniorities.push(v);
        }
        if (seniorities.length === 0) seniorities.push('c_suite', 'vp', 'director', 'manager');

        // ── Params base (títulos + senioridades) ──────────────
        function montarParamsBase(): URLSearchParams {
            const p = new URLSearchParams();
            for (const t of titulosLimitados) p.append('person_titles[]',      t);
            for (const s of seniorities)      p.append('person_seniorities[]', s);
            p.append('per_page', String(max_resultados));
            p.append('page',     String(pagina));
            return p;
        }

        const dominioNormalizado = domain.trim().toLowerCase();
        console.log(`🔍 [Apollo Prospect] Domínio: ${domain} | Depts: ${departamentos.join(', ') || 'todos'} | ${titulosLimitados.length} títulos | Seniorities: ${seniorities.join(', ')}`);

        let pessoas: any[];

        if (filtrar_brasil && isDominioBR(dominioNormalizado)) {
            // ── ESTRATÉGIA DUPLA: domínio .com.br + interseção por localização ──
            // O Apollo não aceita domínio + location juntos → duas queries + interseção
            console.log(`🌎 [Apollo Prospect] Estratégia dupla: domínio BR + interseção por localização`);

            // Query A: por domínio exato
            const paramsA = montarParamsBase();
            paramsA.append('q_organization_domains_list[]', dominioNormalizado);
            const resultadosA = await executarBusca(paramsA);
            const idsA = new Set(resultadosA.map((p: any) => p.id));
            console.log(`📊 [Apollo Prospect] Query A (domínio): ${resultadosA.length} resultados`);

            // Query B: por localização Brasil
            const paramsB = montarParamsBase();
            for (const loc of BR_LOCATIONS) paramsB.append('person_locations[]', loc);
            const resultadosB = await executarBusca(paramsB);
            const idsB = new Set(resultadosB.map((p: any) => p.id));
            console.log(`📊 [Apollo Prospect] Query B (Brasil): ${resultadosB.length} resultados`);

            // Interseção: IDs presentes em ambas as queries
            const idsIntersecao = [...idsA].filter(id => idsB.has(id));
            pessoas = resultadosA.filter((p: any) => idsIntersecao.includes(p.id));
            console.log(`🌎 [Apollo Prospect] Interseção: ${pessoas.length} (de ${resultadosA.length} × ${resultadosB.length})`);

            // Fallback: se interseção vazia, usar query A sem filtro de localização
            // (pode acontecer se pessoa não tem localização indexada no Apollo)
            if (pessoas.length === 0 && resultadosA.length > 0) {
                console.log(`⚠️  [Apollo Prospect] Interseção vazia → usando Query A sem filtro BR`);
                pessoas = resultadosA;
            }

        } else {
            // ── ESTRATÉGIA SIMPLES: só domínio ───────────────────
            const params = montarParamsBase();
            if (domain) params.append('q_organization_domains_list[]', dominioNormalizado);
            if (filtrar_brasil && !domain) {
                for (const loc of BR_LOCATIONS) params.append('person_locations[]', loc);
                console.log(`🌎 [Apollo Prospect] Filtro Brasil por localização (sem domínio)`);
            }
            pessoas = await executarBusca(params);
            console.log(`📊 [Apollo Prospect] Resultados: ${pessoas.length}`);
        }

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
