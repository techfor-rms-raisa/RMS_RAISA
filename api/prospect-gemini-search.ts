/**
 * api/prospect-gemini-search.ts
 *
 * PROSPECT ENGINE v2.0 — Motor de Descoberta de Leads via Gemini AI
 * Substitui: prospect-snovio-search.ts
 *
 * Estratégia:
 * - Usa Gemini 2.5 Flash + Google Search Grounding (nativo)
 * - Busca executivos/decisores por domínio, departamento e senioridade
 * - Retorna lista estruturada com nome, cargo, LinkedIn, nível
 * - SEM login no LinkedIn → dados públicos indexados pelo Google
 * - Custo: ~$0,003–$0,018 por busca (dentro do free tier de 1.500/dia)
 *
 * Versão: 1.0
 * Data: 05/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ─── Timeout estendido (Gemini + Search Grounding pode levar ~10s) ───
export const config = {
    maxDuration: 30,
};

// ─── Lazy init (padrão do gemini-analyze.ts) ─────────────────────────
let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
    if (!aiInstance) {
        const apiKey = process.env.API_KEY || '';
        if (!apiKey) throw new Error('API_KEY não configurada.');
        aiInstance = new GoogleGenAI({ apiKey });
    }
    return aiInstance;
}

// ─── Mapeamento de departamentos → termos de busca em PT-BR ──────────
const DEPT_LABELS: Record<string, string> = {
    ti_tecnologia:          'TI, Tecnologia, CTO, CIO, VP de Tecnologia',
    compras_procurement:    'Compras, Procurement, Suprimentos, CPO',
    infraestrutura:         'Infraestrutura de TI, Cloud, Data Center',
    governanca_compliance:  'Governança, Compliance, Segurança da Informação',
    rh_recursos_humanos:    'Recursos Humanos, RH, People, CHRO',
    comercial_vendas:       'Comercial, Vendas, Revenue, CSO',
    financeiro:             'Financeiro, CFO, Controladoria, Tesouraria',
    diretoria_clevel:       'CEO, COO, Diretor Geral, Presidente, Vice-Presidente',
};

const SENIOR_LABELS: Record<string, string> = {
    c_level:        'CEO, CTO, CIO, COO, CFO, CISO, CPO',
    vp:             'Vice-Presidente, VP',
    diretor:        'Diretor, Director',
    gerente:        'Gerente, Manager',
    coordenador:    'Coordenador, Coordinator',
    superintendente:'Superintendente, Head',
};

// ─── Interface do resultado normalizado ──────────────────────────────
interface ProspectGemini {
    gemini_id:      string;       // hash local para controle
    nome_completo:  string;
    primeiro_nome:  string;
    ultimo_nome:    string;
    cargo:          string;
    nivel:          string;       // C-Level | VP | Diretor | Gerente | etc.
    departamento:   string;
    linkedin_url:   string | null;
    email:          null;         // preenchido pelo Hunter.io depois
    email_status:   null;
    foto_url:       null;
    empresa_nome:   string;
    empresa_dominio:string;
    empresa_setor:  string | null;
    empresa_porte:  null;
    empresa_linkedin: null;
    empresa_website:  null;
    cidade:         string | null;
    estado:         string | null;
    pais:           string | null;
    senioridade:    string | null;
    departamentos:  string[];
    fonte:          'gemini';
    enriquecido:    false;
}

// ─── Função principal de busca ────────────────────────────────────────
async function buscarLeadsGemini(
    domain: string,
    departamentos: string[],
    senioridades: string[],
    maxResultados: number = 20
): Promise<{ resultados: ProspectGemini[]; empresa_nome: string; queries_usadas: string[] }> {

    const ai = getAI();

    // Montar termos de busca a partir dos filtros
    const deptoTermos = departamentos.length > 0
        ? departamentos.map(d => DEPT_LABELS[d] || d).join(', ')
        : 'TI, Tecnologia, Compras, Infraestrutura, Diretoria';

    const seniorTermos = senioridades.length > 0
        ? senioridades.map(s => SENIOR_LABELS[s] || s).join(', ')
        : 'CEO, CTO, CIO, Diretor, Gerente, VP';

    // Extrair nome da empresa do domínio para contextualizar a busca
    const empresaHint = domain
        .replace(/\.(com\.br|com|org|net|io|tech|co)$/, '')
        .replace(/^www\./, '')
        .split('.')[0];

    const prompt = `
Você é um especialista em prospecção B2B. Sua tarefa é encontrar decisores e executivos que trabalham na empresa com domínio "${domain}".

CRITÉRIOS DE BUSCA:
- Empresa: domínio ${domain} (provável nome: ${empresaHint})
- Departamentos alvo: ${deptoTermos}
- Níveis hierárquicos: ${seniorTermos}
- País: Brasil (prioridade) ou global

INSTRUÇÕES:
1. Use o Google Search para buscar executivos desta empresa
2. Procure por: LinkedIn profiles, press releases, notícias, site oficial, About Us
3. Extraia SOMENTE pessoas reais e verificáveis com cargo + empresa confirmados
4. Inclua o LinkedIn URL quando encontrado (formato: linkedin.com/in/usuario)
5. Retorne no máximo ${maxResultados} pessoas
6. NÃO invente ou deduza pessoas — só inclua quem você realmente encontrou
7. Se encontrar o nome da empresa, inclua em empresa_nome

FORMATO DE RESPOSTA — JSON puro, sem markdown, sem backticks:
{
  "empresa_nome": "Nome oficial da empresa",
  "empresa_setor": "Setor (ex: Tecnologia, Telecomunicações, Varejo)",
  "cidade_sede": "Cidade sede se encontrada",
  "estado_sede": "Estado sede se encontrado",
  "pessoas": [
    {
      "nome_completo": "Nome Sobrenome",
      "cargo": "Cargo exato conforme encontrado",
      "nivel": "C-Level|VP|Diretor|Gerente|Coordenador|Outro",
      "departamento": "TI|Compras|Infraestrutura|Governança|RH|Comercial|Financeiro|Diretoria",
      "linkedin_url": "https://linkedin.com/in/usuario ou null",
      "cidade": "Cidade ou null",
      "estado": "Estado (sigla) ou null",
      "pais": "Brasil ou outro"
    }
  ]
}
`.trim();

    console.log(`🤖 [GeminiSearch] Buscando leads para domínio: ${domain}`);
    console.log(`   Departamentos: ${deptoTermos.substring(0, 80)}...`);
    console.log(`   Senioridades: ${seniorTermos.substring(0, 60)}...`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.2,
            maxOutputTokens: 4096,
        } as any
    });

    const rawText = result.text || '';
    console.log(`📦 [GeminiSearch] Resposta raw (${rawText.length} chars)`);

    // Parse defensivo — remove markdown se vier
    const cleanText = rawText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();

    // Extrai bloco JSON
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error('❌ [GeminiSearch] Nenhum JSON válido na resposta');
        console.error('Raw:', rawText.substring(0, 500));
        throw new Error('Gemini não retornou JSON válido. Tente novamente.');
    }

    let parsed: any;
    try {
        parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error('❌ [GeminiSearch] Falha ao parsear JSON:', e);
        throw new Error('Erro ao interpretar resposta do Gemini.');
    }

    const pessoas: any[] = parsed.pessoas || [];
    console.log(`✅ [GeminiSearch] ${pessoas.length} pessoas encontradas`);

    // Normalizar e tipificar resultados
    const resultados: ProspectGemini[] = pessoas.map((p: any, idx: number) => {
        const nomeCompleto = (p.nome_completo || '').trim();
        const partes = nomeCompleto.split(' ');
        const primeiroNome = partes[0] || '';
        const ultimoNome  = partes.slice(1).join(' ') || '';

        return {
            gemini_id:      `gemini_${domain}_${idx}_${Date.now()}`,
            nome_completo:  nomeCompleto,
            primeiro_nome:  primeiroNome,
            ultimo_nome:    ultimoNome,
            cargo:          (p.cargo || '').trim(),
            nivel:          p.nivel || 'Outro',
            departamento:   p.departamento || 'TI',
            linkedin_url:   p.linkedin_url && p.linkedin_url !== 'null' ? p.linkedin_url : null,
            email:          null,
            email_status:   null,
            foto_url:       null,
            empresa_nome:   parsed.empresa_nome || empresaHint,
            empresa_dominio: domain,
            empresa_setor:  parsed.empresa_setor || null,
            empresa_porte:  null,
            empresa_linkedin: null,
            empresa_website:  null,
            cidade:         p.cidade && p.cidade !== 'null' ? p.cidade : null,
            estado:         p.estado && p.estado !== 'null' ? p.estado : null,
            pais:           p.pais || 'Brasil',
            senioridade:    p.nivel || null,
            departamentos:  [p.departamento || 'ti_tecnologia'],
            fonte:          'gemini',
            enriquecido:    false,
        };
    });

    // Extrair queries usadas pelo grounding (para log/debug)
    const groundingMeta = (result as any).candidates?.[0]?.groundingMetadata;
    const queriesUsadas: string[] = groundingMeta?.webSearchQueries || [];
    console.log(`🔍 [GeminiSearch] Google queries: ${queriesUsadas.join(' | ')}`);

    return {
        resultados,
        empresa_nome: parsed.empresa_nome || empresaHint,
        queries_usadas: queriesUsadas,
    };
}

// ─── HANDLER ─────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST.' });
    }

    const {
        domain,
        departamentos   = [],
        senioridades    = [],
        max_resultados  = 20,
    } = req.body;

    if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'domain é obrigatório.' });
    }

    try {
        const { resultados, empresa_nome, queries_usadas } = await buscarLeadsGemini(
            domain.trim().toLowerCase(),
            departamentos,
            senioridades,
            Math.min(max_resultados, 30)
        );

        console.log(`✅ [GeminiSearch] Retornando ${resultados.length} leads para ${domain}`);

        return res.status(200).json({
            success:            true,
            resultados,
            total:              resultados.length,
            empresa:            { nome: empresa_nome, dominio: domain },
            queries_google:     queries_usadas,
            motor:              'gemini',
            creditos_consumidos: 0, // Gemini não usa sistema de créditos
        });

    } catch (error: any) {
        console.error('❌ [GeminiSearch] Erro:', error.message);
        return res.status(500).json({
            success: false,
            error:   error.message || 'Erro ao buscar leads via Gemini',
        });
    }
}
