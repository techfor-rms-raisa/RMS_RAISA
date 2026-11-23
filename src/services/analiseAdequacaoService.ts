// ============================================================
// SERVIÇO: ANÁLISE DE ADEQUAÇÃO DE PERFIL
// Caminho: src/services/analiseAdequacaoService.ts
// ============================================================
// Análise profunda requisito a requisito entre Candidato × Vaga
// Integra com API /api/analise-adequacao-perfil
// ============================================================
// v1.1 — 2026-11-23: PARIDADE entre "Análise de Currículo AI" (AnaliseRisco)
//   e "Candidaturas → Análise de Adequação" (DetalhesCandidaturaModal).
//   Antes, as duas telas chamavam o mesmo endpoint mas montavam payloads
//   diferentes (CV bruto × dados estruturados; vaga sem descrição × com
//   descrição; requisitos "a,b,c" × "a\nb\nc") e gravavam em chaves
//   diferentes (cv_hash+vaga_id × candidatura_id) → resultados divergentes
//   e cache não compartilhado. Agora este serviço é a ÚNICA fonte de:
//   • gerarHashCV            — chave de cache (mesmo algoritmo do AnaliseRisco v4.6)
//   • resolverTextoCV        — prioridade das fontes do texto do CV
//   • montarCandidatoAnalise — payload canônico do candidato
//   • montarVagaAnalise      — payload canônico da vaga
//   • CONFIANCA_MINIMA_VEREDICTO — gate CONF-01 (mesmo valor do backend v2.4)
// ============================================================

// ============================================================
// TIPOS EXPORTADOS
// ============================================================

export type TipoRequisito = 
  | 'HARD_SKILL' 
  | 'COMPETENCIA_FUNCIONAL' 
  | 'EXPERIENCIA_SETOR' 
  | 'FORMACAO' 
  | 'SOFT_SKILL' 
  | 'IDIOMA' 
  | 'CERTIFICACAO';

export type Obrigatoriedade = 
  | 'IMPRESCINDIVEL' 
  | 'MUITO_DESEJAVEL' 
  | 'DESEJAVEL' 
  | 'DIFERENCIAL';

export type NivelAdequacao = 
  | 'ATENDE' 
  | 'ATENDE_PARCIALMENTE' 
  | 'GAP_IDENTIFICADO' 
  | 'NAO_AVALIAVEL';

export type NivelAdequacaoGeral = 
  | 'MUITO_COMPATIVEL' 
  | 'COMPATIVEL' 
  | 'PARCIALMENTE_COMPATIVEL' 
  | 'INCOMPATIVEL';

export type RecomendacaoFinal = 
  | 'APROVAR' 
  | 'ENTREVISTAR' 
  | 'REAVALIAR' 
  | 'REPROVAR';

export interface RequisitoAnalisado {
  requisito: string;
  tipo: TipoRequisito;
  obrigatoriedade: Obrigatoriedade;
  analise_candidato: {
    evidencias_encontradas: string[];
    evidencias_ausentes: string[];
    experiencias_relacionadas: string[];
  };
  nivel_adequacao: NivelAdequacao;
  score_adequacao: number;
  justificativa: string;
  pergunta_investigacao?: string;
  como_mitigar?: string;
}

export interface PerguntaEntrevista {
  pergunta: string;
  objetivo: string;
  o_que_avaliar: string[];
  red_flags: string[];
}

export interface CategoriaPerguntas {
  categoria: string;
  icone: string;
  perguntas: PerguntaEntrevista[];
}

export interface ResumoExecutivo {
  principais_pontos_fortes: string[];
  gaps_criticos: string[];
  gaps_investigar: string[];
  diferenciais_candidato: string[];
}

export interface AvaliacaoFinal {
  recomendacao: RecomendacaoFinal;
  justificativa: string;
  proximos_passos: string[];
  riscos_identificados: string[];
  pontos_atencao_entrevista: string[];
}

export interface AnaliseAdequacaoPerfil {
  // Metadados
  candidato_nome: string;
  vaga_titulo: string;
  data_analise: string;
  
  // Scores gerais
  score_geral: number;
  nivel_adequacao_geral: NivelAdequacaoGeral;
  confianca_analise: number;
  
  // Análise detalhada por requisito
  requisitos_imprescindiveis: RequisitoAnalisado[];
  requisitos_muito_desejaveis: RequisitoAnalisado[];
  requisitos_desejaveis: RequisitoAnalisado[];
  
  // Resumo executivo
  resumo_executivo: ResumoExecutivo;
  
  // Perguntas organizadas por tema
  perguntas_entrevista: CategoriaPerguntas[];
  
  // Avaliação final
  avaliacao_final: AvaliacaoFinal;
  
  // Metadados da API (opcional)
  _metadata?: {
    modelo: string;
    tempo_ms: number;
    tokens_input: number;
    tokens_output: number;
  };

  // v1.1 — Governança CONF-01 (enviada pelo backend analise-adequacao-perfil v2.4)
  analise_parcial?: boolean;        // true = JSON truncado/recuperado ou fallback
  motivo_parcial?: string | null;
  veredicto_confiavel?: boolean;    // = !analise_parcial && confianca_analise >= 80
  modelo_ia?: string;               // modelo realmente usado
}

// Dados de entrada
export interface DadosCandidatoAnalise {
  nome: string;
  titulo_profissional?: string;
  senioridade?: string;
  resumo_profissional?: string;
  skills?: Array<string | { nome: string; nivel?: string; anos_experiencia?: number }>;
  experiencias?: Array<{
    empresa: string;
    cargo: string;
    periodo?: string;
    data_inicio?: string;
    data_fim?: string;
    descricao?: string;
    tecnologias?: string[];
  }>;
  formacoes?: Array<{
    instituicao: string;
    curso: string;
    grau?: string;
    ano_conclusao?: string;
  }>;
  idiomas?: Array<{ idioma: string; nivel: string }>;
  certificacoes?: Array<string | { nome: string; emissor?: string }>;
  curriculo_texto?: string; // Texto completo do CV para análise extra
}

export interface DadosVagaAnalise {
  titulo: string;
  descricao?: string;
  requisitos_obrigatorios?: string;
  requisitos_desejaveis?: string;
  stack_tecnologica?: string[] | string;
  senioridade?: string;
  modalidade?: string;
  cliente_nome?: string;
  setor?: string;
}

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const API_URL = '/api/analise-adequacao-perfil';

/** v1.1 — CONF-01: confiança mínima para um veredicto ser considerado confiável
 *  e para a análise entrar/sair do cache (mesmo valor do backend v2.4). */
export const CONFIANCA_MINIMA_VEREDICTO = 80;

/** v1.1 — Tamanho mínimo para um texto de CV ser considerado utilizável. */
export const TAMANHO_MINIMO_TEXTO_CV = 50;

// ============================================================
// v1.1 — PAYLOAD CANÔNICO (compartilhado pelas duas telas)
// ============================================================

/**
 * Gera hash determinístico do texto do CV — chave de cache junto com vaga_id.
 * ⚠️ Mesmo algoritmo do AnaliseRisco v4.6 (normaliza, corta em 5000 chars, djb2-like,
 * base36) para que as linhas já existentes em analise_adequacao continuem válidas.
 */
export function gerarHashCV(texto: string): string {
  const normalizado = (texto || '').trim().toLowerCase().replace(/\s+/g, ' ').substring(0, 5000);
  let hash = 0;
  for (let i = 0; i < normalizado.length; i++) {
    const char = normalizado.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Escolhe o texto do CV entre várias fontes, na ordem de prioridade informada.
 * Retorna a primeira fonte com conteúdo utilizável (>= TAMANHO_MINIMO_TEXTO_CV).
 * Uso típico: resolverTextoCV(textoExtraidoDoPDF, pessoa.cv_texto_original, candidatura.curriculo_texto)
 */
export function resolverTextoCV(...fontes: Array<string | null | undefined>): string {
  for (const fonte of fontes) {
    const t = typeof fonte === 'string' ? fonte.trim() : '';
    if (t.length >= TAMANHO_MINIMO_TEXTO_CV) return t;
  }
  return '';
}

/** Fonte bruta do candidato — aceita o que cada tela tem disponível. */
export interface FonteCandidatoAnalise {
  nome?: string | null;
  titulo_profissional?: string | null;
  senioridade?: string | null;
  resumo_profissional?: string | null;
  skills?: DadosCandidatoAnalise['skills'] | null;
  experiencias?: Array<Record<string, any>> | null;
  formacoes?: Array<Record<string, any>> | null;
  idiomas?: DadosCandidatoAnalise['idiomas'] | null;
  certificacoes?: DadosCandidatoAnalise['certificacoes'] | null;
  /** Texto do CV já resolvido (ver resolverTextoCV). */
  cv_texto?: string | null;
}

/**
 * Monta o payload canônico do candidato.
 * Regras de paridade:
 *  • curriculo_texto é SEMPRE enviado quando existe (é o que a IA lê com mais evidências);
 *  • dados estruturados entram apenas quando realmente existem — nunca valores
 *    "chutados" (ex.: senioridade 'pleno' fixa), que enviesavam o prompt;
 *  • experiências são normalizadas para o formato que o backend formata.
 */
export function montarCandidatoAnalise(fonte: FonteCandidatoAnalise): DadosCandidatoAnalise {
  const limpar = (v?: string | null) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  const experiencias = (fonte.experiencias || [])
    .filter(exp => exp && (exp.cargo || exp.empresa))
    .map(exp => ({
      empresa: exp.empresa || 'Não informada',
      cargo: exp.cargo || 'Não informado',
      periodo: exp.periodo || undefined,
      data_inicio: exp.data_inicio || undefined,
      data_fim: exp.data_fim || undefined,
      descricao: exp.descricao || undefined,
      tecnologias: Array.isArray(exp.tecnologias) ? exp.tecnologias : []
    }));

  const formacoes = (fonte.formacoes || [])
    .filter(f => f && (f.curso || f.instituicao))
    .map(f => ({
      instituicao: f.instituicao || 'Não informada',
      curso: f.curso || 'Não informado',
      grau: f.grau || f.tipo || undefined,
      ano_conclusao: f.ano_conclusao ? String(f.ano_conclusao) : undefined
    }));

  const cvTexto = limpar(fonte.cv_texto);

  return {
    nome: limpar(fonte.nome) || 'Candidato',
    titulo_profissional: limpar(fonte.titulo_profissional),
    senioridade: limpar(fonte.senioridade),
    resumo_profissional: limpar(fonte.resumo_profissional),
    skills: (fonte.skills || []).filter(Boolean),
    experiencias,
    formacoes,
    idiomas: (fonte.idiomas || []).filter(Boolean),
    certificacoes: (fonte.certificacoes || []).filter(Boolean),
    curriculo_texto: cvTexto
  };
}

/** Fonte bruta da vaga — aceita o registro de `vagas` como vem do Supabase. */
export interface FonteVagaAnalise {
  titulo?: string | null;
  descricao?: string | null;
  requisitos_obrigatorios?: string[] | string | null;
  requisitos?: string[] | string | null;            // legado
  requisitos_desejaveis?: string[] | string | null;
  stack_tecnologica?: string[] | string | null;
  tecnologias?: string[] | string | null;           // legado
  senioridade?: string | null;
  nivel_senioridade?: string | null;                // legado
  modalidade?: string | null;
  cliente_nome?: string | null;
  cliente?: { nome?: string | null } | null;
}

/** Normaliza TEXT[] ou string para "um requisito por linha" (formato único nas duas telas). */
function requisitosParaTexto(valor?: string[] | string | null): string | undefined {
  if (Array.isArray(valor)) {
    const itens = valor.map(v => String(v ?? '').trim()).filter(Boolean);
    return itens.length ? itens.join('\n') : undefined;
  }
  const t = typeof valor === 'string' ? valor.trim() : '';
  return t || undefined;
}

/**
 * Monta o payload canônico da vaga — mesmo conteúdo e mesma formatação
 * independentemente da tela de origem.
 */
export function montarVagaAnalise(vaga: FonteVagaAnalise): DadosVagaAnalise {
  const limpar = (v?: string | null) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const stack = vaga.stack_tecnologica ?? vaga.tecnologias;

  return {
    titulo: limpar(vaga.titulo) || 'Vaga',
    descricao: limpar(vaga.descricao),
    requisitos_obrigatorios: requisitosParaTexto(vaga.requisitos_obrigatorios ?? vaga.requisitos),
    requisitos_desejaveis: requisitosParaTexto(vaga.requisitos_desejaveis),
    stack_tecnologica: Array.isArray(stack) ? stack.filter(Boolean) : limpar(stack as string | null | undefined),
    senioridade: limpar(vaga.senioridade ?? vaga.nivel_senioridade),
    modalidade: limpar(vaga.modalidade),
    cliente_nome: limpar(vaga.cliente_nome ?? vaga.cliente?.nome)
  };
}

// ============================================================
// FUNÇÃO PRINCIPAL: ANALISAR ADEQUAÇÃO
// ============================================================

/**
 * Realiza análise profunda de adequação entre candidato e vaga
 * Analisa cada requisito individualmente e gera perguntas por tema
 */
export async function analisarAdequacaoPerfil(
  candidato: DadosCandidatoAnalise,
  vaga: DadosVagaAnalise,
  opcoes?: {
    incluirPerguntasExtras?: boolean;
    focoEmGaps?: boolean;
  }
): Promise<AnaliseAdequacaoPerfil> {
  console.log('🔍 [AnaliseAdequacao] Iniciando análise profunda...');
  console.log(`   Candidato: ${candidato.nome}`);
  console.log(`   Vaga: ${vaga.titulo}`);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidato, vaga, opcoes })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Falha na análise');
    }

    console.log(`✅ [AnaliseAdequacao] Concluída - Score: ${result.data.score_geral}%`);
    console.log(`   Recomendação: ${result.data.avaliacao_final.recomendacao}`);

    return result.data;

  } catch (error: any) {
    console.error('❌ [AnaliseAdequacao] Erro:', error.message);
    throw error;
  }
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

/**
 * Calcula estatísticas da análise
 */
export function calcularEstatisticas(analise: AnaliseAdequacaoPerfil): {
  totalRequisitos: number;
  atende: number;
  atendeParcialmente: number;
  gaps: number;
  percentualAtendimento: number;
  requisitosImprescindiveisAtendidos: number;
  totalImprescindiveis: number;
} {
  const todosRequisitos = [
    ...analise.requisitos_imprescindiveis,
    ...analise.requisitos_muito_desejaveis,
    ...analise.requisitos_desejaveis
  ];

  const atende = todosRequisitos.filter(r => r.nivel_adequacao === 'ATENDE').length;
  const atendeParcialmente = todosRequisitos.filter(r => r.nivel_adequacao === 'ATENDE_PARCIALMENTE').length;

  // 🆕 Fix: gaps_criticos é a fonte autoritativa da IA para o contador de Gaps.
  // Usar apenas GAP_IDENTIFICADO causava inconsistência: a IA marcava requisitos
  // como ATENDE_PARCIALMENTE mas listava os mesmos como gaps_criticos no resumo.
  const gapsPorRequisito = todosRequisitos.filter(r => r.nivel_adequacao === 'GAP_IDENTIFICADO').length;
  const gaps = Math.max(gapsPorRequisito, analise.resumo_executivo?.gaps_criticos?.length ?? 0);

  const imprescindiveisAtendidos = analise.requisitos_imprescindiveis
    .filter(r => r.nivel_adequacao === 'ATENDE' || r.nivel_adequacao === 'ATENDE_PARCIALMENTE')
    .length;

  return {
    totalRequisitos: todosRequisitos.length,
    atende,
    atendeParcialmente,
    gaps,
    percentualAtendimento: Math.round(((atende + atendeParcialmente * 0.5) / todosRequisitos.length) * 100),
    requisitosImprescindiveisAtendidos: imprescindiveisAtendidos,
    totalImprescindiveis: analise.requisitos_imprescindiveis.length
  };
}

/**
 * Filtra requisitos por nível de adequação
 */
export function filtrarPorAdequacao(
  analise: AnaliseAdequacaoPerfil,
  nivel: NivelAdequacao
): RequisitoAnalisado[] {
  return [
    ...analise.requisitos_imprescindiveis,
    ...analise.requisitos_muito_desejaveis,
    ...analise.requisitos_desejaveis
  ].filter(r => r.nivel_adequacao === nivel);
}

/**
 * Obtém todas as perguntas de entrevista em lista plana
 */
export function obterTodasPerguntas(analise: AnaliseAdequacaoPerfil): PerguntaEntrevista[] {
  return analise.perguntas_entrevista.flatMap(cat => cat.perguntas);
}

/**
 * Obtém perguntas para gaps específicos
 */
export function obterPerguntasParaGaps(analise: AnaliseAdequacaoPerfil): string[] {
  const todosRequisitos = [
    ...analise.requisitos_imprescindiveis,
    ...analise.requisitos_muito_desejaveis,
    ...analise.requisitos_desejaveis
  ];

  return todosRequisitos
    .filter(r => r.pergunta_investigacao && r.nivel_adequacao !== 'ATENDE')
    .map(r => r.pergunta_investigacao!);
}

/**
 * Verifica se candidato deve ser desqualificado
 */
export function verificarDesqualificacao(analise: AnaliseAdequacaoPerfil): {
  desqualificado: boolean;
  motivos: string[];
  gapsEliminatorios: RequisitoAnalisado[];
} {
  const gapsEliminatorios = analise.requisitos_imprescindiveis
    .filter(r => r.nivel_adequacao === 'GAP_IDENTIFICADO');

  return {
    desqualificado: gapsEliminatorios.length > 0,
    motivos: gapsEliminatorios.map(r => r.justificativa),
    gapsEliminatorios
  };
}

/**
 * Formata análise para exibição resumida
 */
export function formatarResumo(analise: AnaliseAdequacaoPerfil): string {
  const stats = calcularEstatisticas(analise);
  
  return `
📊 **Análise de Adequação: ${analise.candidato_nome} × ${analise.vaga_titulo}**

**Score Geral:** ${analise.score_geral}% (${analise.nivel_adequacao_geral.replace('_', ' ')})
**Confiança:** ${analise.confianca_analise}%

**Requisitos Analisados:** ${stats.totalRequisitos}
- ✅ Atende: ${stats.atende}
- ⚠️ Atende Parcialmente: ${stats.atendeParcialmente}
- ❌ Gaps: ${stats.gaps}

**Imprescindíveis:** ${stats.requisitosImprescindiveisAtendidos}/${stats.totalImprescindiveis} atendidos

**Recomendação:** ${analise.avaliacao_final.recomendacao}
${analise.avaliacao_final.justificativa}
  `.trim();
}

/**
 * Obtém cor baseada no nível de adequação
 */
export function getCorAdequacao(nivel: NivelAdequacao): {
  bg: string;
  text: string;
  border: string;
} {
  switch (nivel) {
    case 'ATENDE':
      return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
    case 'ATENDE_PARCIALMENTE':
      return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' };
    case 'GAP_IDENTIFICADO':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
    case 'NAO_AVALIAVEL':
      return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
  }
}

/**
 * Obtém cor baseada na recomendação final
 */
export function getCorRecomendacao(recomendacao: RecomendacaoFinal): {
  bg: string;
  text: string;
  icon: string;
} {
  switch (recomendacao) {
    case 'APROVAR':
      return { bg: 'bg-green-100', text: 'text-green-800', icon: '✅' };
    case 'ENTREVISTAR':
      return { bg: 'bg-blue-100', text: 'text-blue-800', icon: '🎯' };
    case 'REAVALIAR':
      return { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: '⚠️' };
    case 'REPROVAR':
      return { bg: 'bg-red-100', text: 'text-red-800', icon: '❌' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-800', icon: '❓' };
  }
}

/**
 * Obtém ícone do tipo de requisito
 */
export function getIconeTipoRequisito(tipo: TipoRequisito): string {
  const icones: Record<TipoRequisito, string> = {
    'HARD_SKILL': '💻',
    'COMPETENCIA_FUNCIONAL': '📋',
    'EXPERIENCIA_SETOR': '🏢',
    'FORMACAO': '🎓',
    'SOFT_SKILL': '🤝',
    'IDIOMA': '🌍',
    'CERTIFICACAO': '📜'
  };
  return icones[tipo] || '📌';
}

/**
 * Obtém label traduzido do nível de adequação
 */
export function getLabelAdequacao(nivel: NivelAdequacao): string {
  const labels: Record<NivelAdequacao, string> = {
    'ATENDE': 'Atende',
    'ATENDE_PARCIALMENTE': 'Atende Parcialmente',
    'GAP_IDENTIFICADO': 'Gap Identificado',
    'NAO_AVALIAVEL': 'Não Avaliável'
  };
  return labels[nivel] || nivel;
}

// ============================================================
// EXPORT DEFAULT
// ============================================================

const analiseAdequacaoService = {
  analisarAdequacaoPerfil,
  gerarHashCV,
  resolverTextoCV,
  montarCandidatoAnalise,
  montarVagaAnalise,
  calcularEstatisticas,
  filtrarPorAdequacao,
  obterTodasPerguntas,
  obterPerguntasParaGaps,
  verificarDesqualificacao,
  formatarResumo,
  getCorAdequacao,
  getCorRecomendacao,
  getIconeTipoRequisito,
  getLabelAdequacao
};

export default analiseAdequacaoService;
