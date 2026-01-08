// ============================================================
// SERVIÇO: ANÁLISE DE ADEQUAÇÃO DE PERFIL
// Caminho: src/services/analiseAdequacaoService.ts
// ============================================================
// Análise profunda requisito a requisito entre Candidato × Vaga
// Integra com API /api/analise-adequacao-perfil
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
  const gaps = todosRequisitos.filter(r => r.nivel_adequacao === 'GAP_IDENTIFICADO').length;

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
