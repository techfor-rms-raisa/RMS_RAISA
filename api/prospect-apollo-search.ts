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
 * Versão: 2.5
 * Data: 04/03/2026
 *
 * CORREÇÕES v2.5:
 * - ehBrasil() reescrita para lidar com /api_search que retorna has_country (flag)
 *   mas NÃO retorna country/city/state (valores)
 * - Lógica: se tem localização → verifica keywords; se sem dados → inclui (não exclui)
 * - Fallback: se org.primary_domain termina em .br → é Brasil
 * - Log diagnóstico dos campos reais de p[0] para confirmar estrutura
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

// ─── Extrai domínio base: carrefour.com.br → carrefour.com ─────────────────
function extrairDominioBase(domain: string): string {
    const partes = domain.toLowerCase().trim().split('.');
    if (partes.length <= 2) return domain;
    // Detecta ccTLD composto: .com.br, .org.br, .co.uk, etc.
    const ccSLD = ['com', 'org', 'net', 'edu', 'gov', 'co', 'net'];
    if (ccSLD.includes(partes[partes.length - 2])) {
        return `${partes[partes.length - 3]}.${partes[partes.length - 2]}`;
    }
    return `${partes[partes.length - 2]}.${partes[partes.length - 1]}`;
}

// ─── Verifica se pessoa está no Brasil ─────────────────────────────────────
// ATENÇÃO: /mixed_people/api_search retorna campos de localização como flags
// (has_country, has_state) mas NÃO retorna os valores (country, city).
// Estratégias em ordem de confiabilidade:
//   1. Campos diretos (presentes se enriquecido): country, state, city
//   2. organization.primary_domain termina em .br
//   3. present_raw_address contém BR keywords
//   4. Se nenhum campo disponível → INCLUIR (não excluir por falta de dado)
function ehBrasil(p: any): boolean {
    // Estratégia 1: campos diretos de localização (enriquecido)
    const camposDiretos = [
        p.country, p.state, p.city, p.location, p.present_raw_address,
        p.country_code, p.geo,
    ].filter(Boolean).join(' ').toLowerCase();

    if (camposDiretos) {
        const BR_KEYWORDS = [
            'brazil', 'brasil', 'br,', ', br', 'são paulo', 'rio de janeiro',
            'minas gerais', 'brasilia', 'curitiba', 'porto alegre', 'salvador',
            'fortaleza', 'recife', 'manaus', 'belém', 'goiânia',
        ];
        const temKeyword = BR_KEYWORDS.some(kw => camposDiretos.includes(kw));
        if (temKeyword) return true;
        // Se tem localização e NÃO é Brasil → excluir
        const temLocalizacao = !!(p.country || p.city || p.state);
        if (temLocalizacao) return false;
    }

    // Estratégia 2: domínio da organização termina em .br
    const orgDomain = (p.organization?.primary_domain || p.organization?.website_url || '').toLowerCase();
    if (orgDomain && orgDomain.endsWith('.br')) return true;

    // Estratégia 3: sem dados de localização → incluir (princípio da inclusão)
    // O Apollo api_search básico não retorna campos de localização preenchidos
    // Seria um falso negativo excluir alguém sem dados
    return true;
}

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
        // POST /mixed_people/api_search — filtros na query string, body vazio
        // IMPORTANTE: person_locations[] NÃO é usado aqui.
        //   Motivo: person_locations[]=Brazil retorna total_entries:0 para domínios
        //   .com.br. O filtro de Brasil é feito em pós-processamento.
        // ============================================

        // ── Domínios: base + completo para máxima cobertura ──
        // Ex: carrefour.com.br → busca por carrefour.com E carrefour.com.br
        const dominioCompleto = domain.trim().toLowerCase();
        const dominioBase     = extrairDominioBase(dominioCompleto);
        const dominios        = [...new Set([dominioBase, dominioCompleto])];
        console.log(`🔗 [Apollo Prospect] Domínios: ${dominios.join(' + ')}`);

        // ── Títulos ───────────────────────────────────────────
        const titulos: string[] = [];
        for (const dep of departamentos) {
            const ts = DEPARTAMENTO_TITULOS[dep];
            if (ts) titulos.push(...ts);
        }
        if (titulos.length === 0) {
            titulos.push(...[...new Set(Object.values(DEPARTAMENTO_TITULOS).flat())]);
        }
        const titulosLimitados = titulos.slice(0, MAX_TITULOS);

        // ── Senioridades ──────────────────────────────────────
        const seniorities: string[] = [];
        for (const sen of senioridades) {
            const v = SENIORIDADE_MAP[sen];
            if (v && !seniorities.includes(v)) seniorities.push(v);
        }
        if (seniorities.length === 0) seniorities.push('c_suite', 'vp', 'director', 'manager');

        // ── Query string (todos os filtros vão na URL) ────────
        const qs = new URLSearchParams();
        for (const d of dominios)          qs.append('q_organization_domains_list[]', d);
        for (const t of titulosLimitados)  qs.append('person_titles[]',               t);
        for (const s of seniorities)       qs.append('person_seniorities[]',           s);
        qs.append('per_page', String(max_resultados));
        qs.append('page',     String(pagina));

        console.log(`🔍 [Apollo Prospect] Domínio: ${domain} | Depts: ${departamentos.join(', ') || 'todos'} | ${titulosLimitados.length} títulos | Seniorities: ${seniorities.join(', ')}`);

        // POST com body vazio — Apollo lê filtros da query string
        const searchUrl = `${APOLLO_BASE_URL}/mixed_people/api_search?${qs.toString()}`;
        const searchResponse = await fetch(searchUrl, {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'Cache-Control': 'no-cache',
                'accept':        'application/json',
                'x-api-key':     apiKey,
            },
        });

        if (!searchResponse.ok) {
            const errText = await searchResponse.text();
            console.error(`❌ [Apollo Prospect] Erro busca: ${searchResponse.status} - ${errText}`);
            return res.status(200).json({ success: false, error: `Apollo API erro: ${searchResponse.status}`, detalhes: errText });
        }

        const rawText = await searchResponse.text();
        let searchData: any = {};
        try   { searchData = JSON.parse(rawText); }
        catch { console.error(`❌ [Apollo Prospect] JSON inválido:`, rawText.slice(0, 300));
                return res.status(200).json({ success: false, error: 'Resposta inválida Apollo' }); }

        console.log(`📦 [Apollo Prospect] Chaves: ${Object.keys(searchData).join(', ')}`);

        // Apollo pode retornar .people (novos) e/ou .contacts (salvos na conta)
        let pessoas: any[] = [
            ...(searchData.people   || []),
            ...(searchData.contacts || []),
        ];
        const totalBruto = searchData.total_entries ?? searchData.pagination?.total_entries ?? 0;
        console.log(`📊 [Apollo Prospect] Bruto: ${pessoas.length} | total_entries: ${totalBruto}`);

        // DIAGNÓSTICO (remover após confirmar campos disponíveis)
        if (pessoas.length > 0) {
            const p0 = pessoas[0];
            console.log(`🔬 [Apollo Prospect] Campos p[0]:`, JSON.stringify({
                keys:                Object.keys(p0).join(', '),
                country:             p0.country,
                state:               p0.state,
                city:                p0.city,
                location:            p0.location,
                country_code:        p0.country_code,
                present_raw_address: p0.present_raw_address,
                has_country:         p0.has_country,
                has_state:           p0.has_state,
                org_domain:          p0.organization?.primary_domain,
            }));
        }

        // ── Pós-processamento: filtro Brasil ──────────────────
        // Verifica campos country/state/city — muito mais confiável que person_locations
        if (filtrar_brasil) {
            console.log(`🌎 [Apollo Prospect] Filtro Brasil: aplicando pós-processamento`);
            const antes = pessoas.length;
            pessoas = pessoas.filter(ehBrasil);
            console.log(`🌎 [Apollo Prospect] Brasil: ${antes} → ${pessoas.length} (${antes - pessoas.length} excluídos)`);
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
