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
    maxResultados: number = 20,
    empresaNomeExplicito?: string   // ← desambiguador: "Banco Carrefour" vs "Carrefour Varejo"
): Promise<{ resultados: ProspectGemini[]; empresa_nome: string; queries_usadas: string[] }> {

    const ai = getAI();

    // Montar termos de busca a partir dos filtros
    const deptoTermos = departamentos.length > 0
        ? departamentos.map(d => DEPT_LABELS[d] || d).join(', ')
        : 'TI, Tecnologia, Compras, Infraestrutura, Diretoria';

    const seniorTermos = senioridades.length > 0
        ? senioridades.map(s => SENIOR_LABELS[s] || s).join(', ')
        : 'CEO, CTO, CIO, Diretor, Gerente, VP';

    // Nome da empresa: usa o explícito se informado, senão deriva do domínio
    const empresaHint = empresaNomeExplicito?.trim() ||
        domain
            .replace(/\.(com\.br|com|org|net|io|tech|co)$/, '')
            .replace(/^www\./, '')
            .split('.')[0];

    // Instrução de desambiguação — só ativa quando usuário informou nome explícito
    const desambiguacaoInstrucao = empresaNomeExplicito?.trim()
        ? `
ATENÇÃO — DESAMBIGUAÇÃO OBRIGATÓRIA:
- O domínio "${domain}" pertence a um grupo maior, mas você deve buscar APENAS executivos de "${empresaNomeExplicito}"
- IGNORE completamente outras unidades do grupo (ex: se buscar "Banco Carrefour", ignore Carrefour Varejo, Carrefour Soluções, etc.)
- Valide que o cargo e a unidade de negócio da pessoa correspondem a "${empresaNomeExplicito}"
- Se não tiver certeza se a pessoa é da unidade correta, NÃO a inclua
`
        : '';

    // Montar queries segmentadas por nível para maximizar cobertura
    const queriesSegmentadas = [
        `"${empresaHint}" Diretor Gerente TI Tecnologia Infraestrutura LinkedIn Brasil`,
        `"${empresaHint}" CTO CIO VP Head Tecnologia site:linkedin.com`,
        `"${empresaHint}" Superintendente Coordenador Segurança Cloud LinkedIn`,
        ...(empresaNomeExplicito ? [`"${empresaNomeExplicito}" executivos liderança tecnologia`] : []),
    ].join('\n   ');

    const prompt = `
Você é um especialista em prospecção B2B com acesso ao Google Search. Sua missão é encontrar o MÁXIMO de decisores e executivos reais da empresa alvo.

EMPRESA ALVO:
- Nome: ${empresaNomeExplicito ? `"${empresaNomeExplicito}"` : empresaHint}
- Domínio de email: ${domain}
- Departamentos: ${deptoTermos}
- Níveis hierárquicos: ${seniorTermos}
- País: Brasil (prioridade)
${desambiguacaoInstrucao}
ESTRATÉGIA DE BUSCA — execute MÚLTIPLAS queries diferentes:
   ${queriesSegmentadas}
   site:linkedin.com/in "${empresaHint}" Gerente
   site:linkedin.com/in "${empresaHint}" Diretor
   "${empresaHint}" "Head de" OR "Gerente de" OR "Diretor de" TI
   "${domain}" executivos linkedin.com/in

REGRAS CRÍTICAS:
1. Execute pelo menos 6 queries diferentes para maximizar cobertura
2. META OBRIGATÓRIA: encontre entre ${Math.floor(maxResultados * 0.7)} e ${maxResultados} pessoas — NÃO pare antes de atingir a meta mínima
3. Após cada query, adicione os novos nomes encontrados à lista — não descarte duplicatas ainda
4. Ao final, remova duplicatas e retorne apenas pessoas únicas
5. Inclua pessoas de TODOS os níveis solicitados: C-Level, VP, Diretor, Gerente, Superintendente
6. Para cada pessoa encontrada, faça uma busca adicional pelo LinkedIn específico dela
7. linkedin_url: inclua SEMPRE quando encontrado (formato: https://www.linkedin.com/in/usuario)
8. NUNCA invente pessoas, cargos ou URLs — apenas dados verificados
9. empresa_nome: use o nome da unidade específica, não do grupo

FORMATO DE RESPOSTA — JSON puro, sem markdown, sem backticks:
{
  "empresa_nome": "Nome da unidade específica",
  "empresa_setor": "Setor principal",
  "cidade_sede": "Cidade ou null",
  "estado_sede": "Estado (sigla) ou null",
  "pessoas": [
    {
      "nome_completo": "Nome Sobrenome",
      "cargo": "Cargo exato",
      "nivel": "C-Level|VP|Diretor|Gerente|Coordenador|Superintendente|Outro",
      "departamento": "TI|Compras|Infraestrutura|Governança|RH|Comercial|Financeiro|Diretoria",
      "linkedin_url": "https://www.linkedin.com/in/usuario ou null",
      "cidade": "Cidade ou null",
      "estado": "UF ou null",
      "pais": "Brasil ou outro"
    }
  ]
}
`.trim();

    console.log(`🤖 [GeminiSearch] Buscando leads para domínio: ${domain}${empresaNomeExplicito ? ` (${empresaNomeExplicito})` : ''}`);
    console.log(`   Departamentos: ${deptoTermos.substring(0, 80)}...`);
    console.log(`   Senioridades: ${seniorTermos.substring(0, 60)}...`);
    console.log(`   Meta: ${Math.floor(maxResultados * 0.7)}–${maxResultados} pessoas`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.7,      // ↑ mais exploratório (era 0.2 — muito conservador)
            maxOutputTokens: 8192, // ↑ suporte a 20+ pessoas em JSON (era 4096)
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

        // Normalizar linkedin_url — garantir formato https://www.linkedin.com/in/...
        const rawLinkedin = p.linkedin_url;
        let linkedinNorm: string | null = null;
        if (rawLinkedin && rawLinkedin !== 'null' && rawLinkedin.includes('linkedin.com/in/')) {
            linkedinNorm = rawLinkedin.startsWith('http')
                ? rawLinkedin.trim()
                : `https://${rawLinkedin.trim()}`;
        }

        return {
            gemini_id:      `gemini_${domain}_${idx}_${Date.now()}`,
            nome_completo:  nomeCompleto,
            primeiro_nome:  primeiroNome,
            ultimo_nome:    ultimoNome,
            cargo:          (p.cargo || '').trim(),
            nivel:          p.nivel || 'Outro',
            departamento:   p.departamento || 'TI',
            linkedin_url:   linkedinNorm,
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
        empresa_nome,       // ← desambiguador opcional: "Banco Carrefour"
        departamentos   = [],
        senioridades    = [],
        max_resultados  = 20,
    } = req.body;

    if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'domain é obrigatório.' });
    }

    try {
        const { resultados, empresa_nome: empresaRetornada, queries_usadas } = await buscarLeadsGemini(
            domain.trim().toLowerCase(),
            departamentos,
            senioridades,
            Math.min(max_resultados, 30),
            empresa_nome || undefined
        );

        console.log(`✅ [GeminiSearch] Retornando ${resultados.length} leads para ${domain}${empresa_nome ? ` (${empresa_nome})` : ''}`);

        return res.status(200).json({
            success:             true,
            resultados,
            total:               resultados.length,
            empresa:             { nome: empresaRetornada, dominio: domain },
            queries_google:      queries_usadas,
            motor:               'gemini',
            creditos_consumidos: 0,
        });

    } catch (error: any) {
        console.error('❌ [GeminiSearch] Erro:', error.message);
        return res.status(500).json({
            success: false,
            error:   error.message || 'Erro ao buscar leads via Gemini',
        });
    }
}
