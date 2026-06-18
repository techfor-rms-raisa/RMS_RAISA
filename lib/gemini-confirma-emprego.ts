/**
 * lib/gemini-confirma-emprego.ts — Fallback Gemini para Revalidação (Etapa 2-B)
 *
 * v2.1 (18/06/2026 — Refinamento do bloco NÍVEL DE CONFIANÇA + few-shot)
 *
 *   Motivado por sintoma observado nos smokes de 18/06: casos com evidência
 *   sólida (Luiza Trajano @ Magazine Luiza — LinkedIn público + dezenas de
 *   fontes corporativas) retornavam `confianca=media` em vez de `alta`,
 *   enquanto Frederico Trajano (mesma estrutura) retornava `alta`. A régua
 *   v2.0 era descritiva mas exigia AND implícito ("LinkedIn confirma E
 *   cargo E data recente") — qualquer ambiguidade em 1 dos 3 qualificadores
 *   degradava silenciosamente para "media".
 *
 *   MUDANÇAS CIRÚRGICAS (apenas montarPromptPrincipal + cabeçalho):
 *
 *     1. Critérios de "alta" reescritos como SUFICIÊNCIA (OR) — basta uma
 *        das 3 condições estar claramente atendida:
 *          (i)   LinkedIn público confirma empresa atual
 *          (ii)  2+ fontes corporativas independentes corroboram
 *          (iii) Pessoa em posição pública verificável (C-level/conselho)
 *                de empresa listada/conhecida mencionada em imprensa
 *                2025-2026
 *
 *     2. Critérios de "media" também explicitados como SUFICIÊNCIA com
 *        3 condições mutuamente exclusivas vs "alta".
 *
 *     3. REGRA DE DESEMPATE explícita: havendo evidência razoável para
 *        "alta", NÃO degradar para "media" por excesso de cautela. Quebra
 *        o viés conservador padrão do modelo com temperature=0.1.
 *
 *     4. Bloco EXEMPLOS DE CALIBRAGEM (few-shot) com 3 casos sintéticos
 *        — alta/media/baixa — usando nomes/empresas genéricos (Maria
 *        Santos/Itaú, João Silva/ACME, Pedro Costa/Beta Corp) para não
 *        enviesar casos reais.
 *
 *   ZERO MUDANÇAS EM: robustez (B1-B4), bugfixes (C1-C3), prompt do retry
 *   simplificado, assinatura externa (GeminiConfirmaInput/Result), helpers,
 *   integração com prospect-revalidate.ts v1.5.
 *
 *   Risco residual: baixo. Smoke isolado via
 *   /api/gemini-confirma-test?suite=true valida em <30s.
 *
 * v2.0 (18/06/2026 — Refinamento de prompt + robustez para empresas BR médio porte)
 *
 *   Refinamento integral disparado por sintoma observado em 17-18/06:
 *   Gemini Search Grounding retornava `payload_gemini=null` para leads
 *   com perfis LinkedIn públicos verificáveis (Clairton/3 Corações,
 *   Rulyan/ACOME do Brasil). Configuração técnica do modelo está
 *   correta — problema era de prompt + robustez, não infra.
 *
 *   CATEGORIA A — PROMPT (4 ajustes semânticos):
 *
 *     A1. "Onde X trabalha em <mes/ano>?" (prospectivo + temporal)
 *         Substitui "Ainda trabalha em Y?" (yes/no retrospectivo) que
 *         confundia o modelo quando a pessoa havia trocado de empresa.
 *
 *     A2. LinkedIn como prioridade ABSOLUTA da busca, não uma fonte
 *         entre quatro paralelas. Query forçada:
 *         `site:linkedin.com/in/ "Nome Completo"`.
 *
 *     A3. Mês/ano atual injetado dinamicamente no prompt (via
 *         `getMesAnoAtual()`). Sem isso, o modelo pode usar a primeira
 *         fonte cronológica que encontra (notícia de 2022).
 *
 *     A4. Regras explícitas de comparação de nomes de empresa: aceitar
 *         razão social vs nome fantasia, abreviações, variações
 *         ortográficas, acentos. Evita falsos "trocou_empresa" quando
 *         o CRM tem "TechFor TI" e LinkedIn tem "TechFor TI Soluções".
 *
 *   CATEGORIA B — ROBUSTEZ (4 ajustes técnicos):
 *
 *     B1. Timeout 25s via `Promise.race` (não AbortController — o SDK
 *         @google/genai não documenta suporte a abortSignal). Margem
 *         confortável dentro dos 60s do `maxDuration` Vercel.
 *
 *     B2. 1 retry com prompt simplificado quando rawText volta vazio.
 *         Tentativa #2 usa timeout reduzido (15s) e prompt enxuto para
 *         maximizar chance de obter alguma resposta utilizável.
 *
 *     B3. Log estruturado quando rawText vazio: inclui primeiros 500
 *         chars do objeto response completo (não só do texto) para
 *         diagnóstico em logs Vercel.
 *
 *     B4. Log de início (🔍) imediatamente após validação de input.
 *         Permite confirmar que Gemini foi efetivamente chamado.
 *
 *   CATEGORIA C — BUGFIXES SUTIS (3 ajustes):
 *
 *     C1. Normalização de `confianca` remove acentos antes de comparar.
 *         "média" (com acento, retorno comum do modelo em PT-BR) agora
 *         é reconhecido como 'media'. Antes virava 'baixa' silenciosamente.
 *
 *     C2. Extração de JSON usa primeira-chave-aberta + última-chave-fechada
 *         com fallback para regex non-greedy. Cobre casos onde Gemini
 *         devolve múltiplos blocos JSON no rawText.
 *
 *     C3. Helper `ehValorValido()` reconhece "null", "undefined", "n/a",
 *         "-", "?" como ausência de valor. Modelo às vezes devolve esses
 *         strings em vez de `null` nativo.
 *
 *   ASSINATURA EXTERNA INALTERADA — `GeminiConfirmaInput` e
 *   `GeminiConfirmaResult` mantidos identicamente. `prospect-revalidate.ts`
 *   v1.5 NÃO precisa de ajuste.
 *
 * v1.0 (17/06/2026)
 *
 * Quando o Apollo People Match retorna vazio (caso muito comum para perfis
 * de empresas brasileiras de médio porte que o Apollo não indexa), este
 * adapter usa Gemini 2.5 Flash com Google Search grounding para confirmar:
 *   - se a pessoa ainda trabalha na empresa antiga (CRM)
 *   - empresa atual, cargo atual, LinkedIn URL
 *   - nível de confiança: 'alta' | 'media' | 'baixa'
 *
 * Padrão técnico copiado de api/prospect-resolve-domain.ts v1.1:
 *   - gemini-2.5-flash (estável após depreciação de 2.0-flash em 01/06/2026)
 *   - maxOutputTokens: 8192 (modelo precisa de tokens para "pensar")
 *   - thinkingConfig.thinkingBudget: 4096 (obrigatório p/ Search Grounding)
 *
 * Custo: ~$0 (cota generosa Gemini). Latência: 3-8s por chamada com Search.
 * É o motor mais lento da cascata — usado só quando Apollo vazia.
 *
 * Caminho: lib/gemini-confirma-emprego.ts
 */

import { GoogleGenAI } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.API_KEY || '';
    if (!apiKey) throw new Error('API_KEY (Gemini) não configurada.');
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

// ──────────────────────────────────────────────────────────────────────
// 🆕 v2.0 — CONSTANTES OPERACIONAIS
// ──────────────────────────────────────────────────────────────────────

/** Timeout da chamada principal Gemini (margem dos 60s Vercel maxDuration). */
const GEMINI_TIMEOUT_MS_PRIMARIO  = 25_000;

/** Timeout do retry (prompt simplificado, mais curto). */
const GEMINI_TIMEOUT_MS_RETRY     = 15_000;

/** Tamanho máximo do rawText anexado ao motivo em caso de erro (logs Vercel). */
const RAWTEXT_DEBUG_MAX_CHARS     = 500;

// ──────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS — ASSINATURA INALTERADA EM v2.0/v2.1
// ──────────────────────────────────────────────────────────────────────

export interface GeminiConfirmaInput {
  nome_completo:    string;
  empresa_antiga:   string;            // empresa atual no CRM (a ser confirmada/refutada)
  empresa_dominio?: string | null;
  linkedin_url?:    string | null;
  cargo_anterior?:  string | null;
}

export interface GeminiConfirmaResult {
  /** True quando Gemini retornou empresa_atual com confiança >= 'media'. */
  encontrado:      boolean;
  empresa_nome?:   string;
  cargo?:          string;
  linkedin_url?:   string;
  confianca:       'alta' | 'media' | 'baixa';
  evidencia_url?:  string;
  /** Payload completo do Gemini, para auditoria em prospect_revalidacao_log. */
  payload_raw?:    any;
  /** Motivo quando encontrado=false (sem JSON, confiança baixa, etc). */
  motivo?:         string;
}

// ──────────────────────────────────────────────────────────────────────
// HELPERS PRIVADOS — 🆕 v2.0
// ──────────────────────────────────────────────────────────────────────

/**
 * 🆕 v2.0 (A3) — Retorna "mês de ano" em PT-BR para injetar no prompt.
 *   Ex: "junho de 2026". Calcula dinamicamente — sempre atual.
 */
function getMesAnoAtual(): string {
  const meses = [
    'janeiro', 'fevereiro', 'março',    'abril',
    'maio',    'junho',     'julho',    'agosto',
    'setembro','outubro',   'novembro', 'dezembro',
  ];
  const agora = new Date();
  return `${meses[agora.getMonth()]} de ${agora.getFullYear()}`;
}

/**
 * 🆕 v2.0 (C1) — Normaliza confiança removendo acentos antes de comparar.
 *   Modelo PT-BR às vezes devolve "média"/"baixa"/"alta" com acento, e o
 *   check direto contra ['media','alta'] descartava silenciosamente.
 */
function normalizarConfianca(v: any): 'alta' | 'media' | 'baixa' {
  const s = String(v || 'baixa')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove acentos
  if (s === 'alta')  return 'alta';
  if (s === 'media') return 'media';
  return 'baixa';
}

/**
 * 🆕 v2.0 (C3) — Reconhece "null", "undefined", "n/a", "-", "?" como
 *   ausência de valor. Modelo às vezes devolve essas strings literais
 *   em vez do `null` JSON nativo.
 */
function ehValorValido(v: any): boolean {
  if (v == null) return false;
  if (typeof v !== 'string') return Boolean(v);
  const s = v.trim().toLowerCase();
  return s !== '' &&
         s !== 'null' &&
         s !== 'undefined' &&
         s !== 'n/a' &&
         s !== '-'  &&
         s !== '?';
}

/**
 * 🆕 v2.0 (C2) — Extrai bloco JSON do texto retornado pelo Gemini.
 *   Estratégia: primeira `{` até última `}` correspondente. Fallback
 *   para regex non-greedy se o primeiro parse falhar.
 */
function extrairJSONDeTexto(text: string): any | null {
  const inicio = text.indexOf('{');
  const fim    = text.lastIndexOf('}');
  if (inicio === -1 || fim === -1 || fim <= inicio) return null;

  // Tentativa 1: bloco completo do primeiro `{` ao último `}`
  const candidato1 = text.substring(inicio, fim + 1);
  try {
    return JSON.parse(candidato1);
  } catch {
    // Tentativa 2: regex non-greedy buscando o primeiro bloco simples
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * 🆕 v2.0 (B1) — Chama Gemini com timeout via Promise.race.
 *   SDK @google/genai não documenta suporte a AbortSignal, então
 *   esse é o pattern mais portável. Retorna o objeto result inteiro
 *   ou lança erro em caso de timeout/falha.
 */
async function chamarGeminiComTimeout(
  ai: GoogleGenAI,
  prompt: string,
  timeoutMs: number,
): Promise<any> {
  const geminiPromise = ai.models.generateContent({
    model:    'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools:           [{ googleSearch: {} }],
      temperature:     0.1,
      maxOutputTokens: 8192,
      thinkingConfig:  { thinkingBudget: 4096 },
    } as any,
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Gemini timeout ${timeoutMs}ms`)),
      timeoutMs,
    ),
  );

  return Promise.race([geminiPromise, timeoutPromise]);
}

/**
 * 🆕 v2.0 — Extrai rawText do objeto result do Gemini de forma defensiva.
 *   Pattern observado em prospect-resolve-domain v1.1 + fallback duplo.
 */
function extrairRawText(result: any): string {
  let rawText = '';
  try {
    const candidates = result?.candidates;
    if (candidates?.[0]?.content?.parts) {
      rawText = candidates[0].content.parts
        .filter((p: any) => p.text && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('');
    }
    if (!rawText && result?.text) rawText = result.text;
  } catch {
    rawText = result?.text || '';
  }
  return rawText;
}

// ──────────────────────────────────────────────────────────────────────
// PROMPTS — 🆕 v2.1
// ──────────────────────────────────────────────────────────────────────

/**
 * Prompt principal — 🆕 v2.1:
 *   Mantém todos os ajustes v2.0 (A1+A2+A3+A4) e refina o bloco
 *   NÍVEL DE CONFIANÇA + adiciona EXEMPLOS DE CALIBRAGEM (few-shot).
 *
 *   Mudança-chave: critérios de "alta" agora são de SUFICIÊNCIA (OR) —
 *   basta UMA das 3 condições estar atendida. Antes era AND implícito
 *   ("LinkedIn confirma E cargo E data recente"), que degradava para
 *   "media" quando qualquer qualificador ficava ambíguo.
 */
function montarPromptPrincipal(input: GeminiConfirmaInput): string {
  const mesAno = getMesAnoAtual();
  const linkedinHint = input.linkedin_url
    ? `\n- LinkedIn de referência (pode estar desatualizado): ${input.linkedin_url}`
    : '';
  const cargoHint = input.cargo_anterior
    ? `\n- Cargo registrado no CRM (pode estar desatualizado): ${input.cargo_anterior}`
    : '';

  return `
Sua tarefa: identificar onde "${input.nome_completo}" trabalha ATUALMENTE em ${mesAno}.

Contexto do CRM:
- Empresa registrada: "${input.empresa_antiga}"${linkedinHint}${cargoHint}

ESTRATÉGIA DE BUSCA (siga em ordem):
1. PRIORIDADE MÁXIMA — buscar o LinkedIn público da pessoa primeiro:
   site:linkedin.com/in/ "${input.nome_completo}"
2. Se LinkedIn não retornar resultado claro, buscar:
   "${input.nome_completo}" cargo empresa 2026
3. Como último recurso, sites corporativos ou notícias recentes (2024-2026).

CRITÉRIOS PARA COMPARAR EMPRESAS — considere a MESMA empresa quando:
- Razão social vs nome fantasia (ex: "Cia. Brasileira de Distribuição" = "GPA" = "Pão de Açúcar").
- Variação ortográfica/abreviação (ex: "TechFor TI" = "TECHFOR" = "TechFor TI Soluções").
- Acentos/espaços não diferenciam (ex: "ACOME" = "Acomé" = "ACOME do Brasil").

NÍVEL DE CONFIANÇA (escolha o mais alto que se aplique):

- alta: BASTA UMA das condições abaixo estar claramente atendida:
  (i)   LinkedIn público da pessoa confirma a empresa atual (mesmo que o cargo não esteja explícito ou exatamente igual ao registrado no CRM).
  (ii)  2 ou mais fontes corporativas independentes corroboram a posição atual (site oficial da empresa, sala de imprensa, comunicado, press release, relatório anual, perfis em conferências/eventos).
  (iii) Pessoa em posição pública verificável (presidência, conselho de administração, diretoria, C-level, founder/co-founder) de empresa listada na bolsa ou amplamente conhecida no mercado, mencionada por veículos de imprensa em 2025-2026.

- media: nenhuma das condições de "alta" se aplica, mas pelo menos UMA das abaixo está atendida:
  (i)   Apenas 1 fonte corporativa de 2025-2026 (uma única notícia, site, ou perfil profissional não-LinkedIn).
  (ii)  LinkedIn público existe e menciona a empresa, mas cargo/empresa parecem desatualizados ou sem indicação clara de data recente.
  (iii) Fontes corporativas com leve divergência mas apontando para a mesma empresa-mãe/grupo (ex: subsidiária vs holding).

- baixa: sem evidência clara, OU fontes conflitantes (empresas diferentes sem como desambiguar), OU apenas informação anterior a 2025, OU pessoa com nome muito comum sem identificador único disponível.

REGRA DE DESEMPATE: quando houver evidência razoável para "alta" (LinkedIn confirmando a empresa OU 2+ fontes corporativas corroborando), NÃO degrade para "media" apenas por excesso de cautela. A regra existe para discriminar confiança real, não para hedge defensivo.

EXEMPLOS DE CALIBRAGEM (use como âncora para classificar):

Exemplo 1 — ALTA confiança:
  Nome: "Maria Santos"; CRM: "Itaú Unibanco"
  Fontes encontradas: LinkedIn público "Maria Santos — Diretora de Tecnologia, Itaú Unibanco — desde mar/2024"; sala de imprensa do Itaú cita "Maria Santos, Diretora de TI" em release de jan/2026.
  → confianca: "alta" (atende (i) LinkedIn + (ii) 2 fontes corporativas independentes)

Exemplo 2 — MEDIA confiança:
  Nome: "João Silva"; CRM: "ACME Tech"
  Fontes encontradas: portal setorial em 2025 cita "João Silva, gerente de produto na ACME"; sem perfil LinkedIn público localizado para confirmar.
  → confianca: "media" (atende (i) — 1 fonte corporativa única, sem LinkedIn de apoio)

Exemplo 3 — BAIXA confiança:
  Nome: "Pedro Costa"; CRM: "Beta Corp"
  Fontes encontradas: 3 perfis distintos chamados "Pedro Costa" em empresas diferentes; nenhum identificador único (LinkedIn, cargo específico) permite desambiguação.
  → confianca: "baixa" (fontes conflitantes + nome comum, sem identificador)

Responda SOMENTE com JSON válido (sem markdown, sem backticks, sem texto antes/depois):
{
  "empresa_atual":  "<nome da empresa atual ou null>",
  "cargo_atual":    "<cargo atual ou null>",
  "linkedin_url":   "<URL completa do LinkedIn ou null>",
  "confianca":      "alta" | "media" | "baixa",
  "evidencia_url":  "<URL da fonte principal usada>"
}

Se não conseguir confirmar com confianca >= "media", retorne todos os campos como null exceto confianca: "baixa".
`.trim();
}

/**
 * Prompt simplificado para retry — 🆕 v2.0 (B2):
 *   Usado quando a 1ª tentativa retornou rawText vazio.
 *   Mais enxuto, foco único no LinkedIn, schema JSON mínimo.
 */
function montarPromptRetrySimplificado(input: GeminiConfirmaInput): string {
  const mesAno = getMesAnoAtual();
  return `
Onde "${input.nome_completo}" trabalha em ${mesAno}?
Busque: site:linkedin.com/in/ "${input.nome_completo}"

Responda SOMENTE com JSON (sem markdown):
{"empresa_atual":"<nome ou null>","cargo_atual":"<cargo ou null>","linkedin_url":"<url ou null>","confianca":"alta"|"media"|"baixa","evidencia_url":"<url>"}
`.trim();
}

// ──────────────────────────────────────────────────────────────────────
// FUNÇÃO PÚBLICA — geminiConfirmaEmprego
// ──────────────────────────────────────────────────────────────────────

export async function geminiConfirmaEmprego(
  input: GeminiConfirmaInput
): Promise<GeminiConfirmaResult> {

  if (!input.nome_completo || !input.empresa_antiga) {
    return {
      encontrado: false,
      confianca:  'baixa',
      motivo:     'Faltam dados mínimos: nome_completo e empresa_antiga',
    };
  }

  // 🆕 v2.0 (B4) — Log de início (permite confirmar que Gemini foi chamado)
  console.log(
    `🔍 [geminiConfirmaEmprego] Buscando: ${input.nome_completo} ` +
    `(CRM: ${input.empresa_antiga})`,
  );

  const ai = getAI();

  try {
    // ─────────────────────────────────────────────────────────────────
    // TENTATIVA 1 — Prompt principal com timeout 25s
    // ─────────────────────────────────────────────────────────────────
    const promptPrincipal = montarPromptPrincipal(input);
    let result: any;
    let rawText = '';
    let usouRetry = false;

    try {
      result  = await chamarGeminiComTimeout(ai, promptPrincipal, GEMINI_TIMEOUT_MS_PRIMARIO);
      rawText = extrairRawText(result);
    } catch (err: any) {
      console.warn(
        `⚠️ [geminiConfirmaEmprego] Tentativa 1 falhou (${err?.message}) — ` +
        `tentando retry com prompt simplificado`,
      );
      // Cai pro retry abaixo
    }

    // ─────────────────────────────────────────────────────────────────
    // TENTATIVA 2 — 🆕 v2.0 (B2) Retry com prompt simplificado se rawText vazio
    // ─────────────────────────────────────────────────────────────────
    if (!rawText) {
      // 🆕 v2.0 (B3) — Log estruturado quando rawText vazio (debug fácil)
      const debugSnapshot = result
        ? JSON.stringify(result).substring(0, RAWTEXT_DEBUG_MAX_CHARS)
        : '(sem result)';
      console.warn(
        `⚠️ [geminiConfirmaEmprego] Tentativa 1 rawText vazio para ` +
        `${input.nome_completo}. Response snapshot: ${debugSnapshot}`,
      );

      usouRetry = true;
      const promptRetry = montarPromptRetrySimplificado(input);
      try {
        result  = await chamarGeminiComTimeout(ai, promptRetry, GEMINI_TIMEOUT_MS_RETRY);
        rawText = extrairRawText(result);
      } catch (err: any) {
        console.error(
          `❌ [geminiConfirmaEmprego] Retry também falhou (${err?.message}) ` +
          `para ${input.nome_completo}`,
        );
        return {
          encontrado: false,
          confianca:  'baixa',
          motivo:     `Gemini falhou em 2 tentativas: ${err?.message}`,
        };
      }
    }

    if (!rawText) {
      console.error(
        `❌ [geminiConfirmaEmprego] Ambas tentativas retornaram vazio ` +
        `para ${input.nome_completo}`,
      );
      return {
        encontrado: false,
        confianca:  'baixa',
        motivo:     'Gemini retornou texto vazio em 2 tentativas',
      };
    }

    // ─────────────────────────────────────────────────────────────────
    // PARSING — 🆕 v2.0 (C2) Extração robusta de JSON
    // ─────────────────────────────────────────────────────────────────
    const parsed = extrairJSONDeTexto(rawText);
    if (!parsed) {
      return {
        encontrado:  false,
        confianca:   'baixa',
        motivo:      'Gemini retornou texto sem JSON parseável',
        payload_raw: { rawText: rawText.substring(0, RAWTEXT_DEBUG_MAX_CHARS), usouRetry },
      };
    }

    // 🆕 v2.0 (C1) — Normaliza confiança com remoção de acentos
    const confianca = normalizarConfianca(parsed.confianca);

    // 🆕 v2.0 (C3) — Check robusto contra strings "null" e similares
    const empresaValida = ehValorValido(parsed.empresa_atual);

    // Confiança baixa OU sem empresa válida → não encontrado
    if (confianca === 'baixa' || !empresaValida) {
      return {
        encontrado:  false,
        confianca,
        motivo:      'Gemini não conseguiu confirmar com confiança suficiente',
        payload_raw: { ...parsed, usouRetry },
      };
    }

    const empresaNome  = String(parsed.empresa_atual).trim();
    const cargoFinal   = ehValorValido(parsed.cargo_atual)    ? String(parsed.cargo_atual).trim()    : undefined;
    const linkedinFinal = ehValorValido(parsed.linkedin_url)  ? String(parsed.linkedin_url).trim()   : undefined;
    const evidenciaFinal = ehValorValido(parsed.evidencia_url) ? String(parsed.evidencia_url).trim() : undefined;

    console.log(
      `✅ [geminiConfirmaEmprego] ${input.nome_completo} → ${empresaNome} ` +
      `(${cargoFinal || '?'}) [confianca=${confianca}${usouRetry ? ', retry' : ''}]`,
    );

    return {
      encontrado:    true,
      empresa_nome:  empresaNome,
      cargo:         cargoFinal,
      linkedin_url:  linkedinFinal,
      confianca,
      evidencia_url: evidenciaFinal,
      payload_raw:   { ...parsed, usouRetry },
    };

  } catch (err: any) {
    console.error(`❌ [geminiConfirmaEmprego] Erro inesperado: ${err?.message}`);
    return {
      encontrado: false,
      confianca:  'baixa',
      motivo:     `Erro na chamada Gemini: ${err?.message}`,
    };
  }
}
