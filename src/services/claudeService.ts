// ============================================================
// CLAUDE SERVICE - Decisões Críticas com IA Premium
// Modelo: Claude Haiku 3.5 (30% das requisições)
// ============================================================
// Caminho: src/services/claudeService.ts
// ============================================================

// ============================================================
// TIPOS
// ============================================================

// GAP - Lacuna identificada entre candidato e vaga
export interface GapAnalise {
  categoria: 'TECNICO' | 'EXPERIENCIA' | 'FORMACAO' | 'IDIOMA' | 'SOFT_SKILL' | 'CULTURAL' | 'LOGISTICO';
  requisito_vaga: string;
  situacao_candidato: string;
  severidade: 'ELIMINATORIO' | 'IMPORTANTE' | 'DESEJAVEL' | 'MENOR';
  impacto: 'DESQUALIFICA' | 'REQUER_AVALIACAO' | 'ACEITAVEL';
  justificativa: string;
  pergunta_sugerida?: string; // Pergunta para o analista investigar
  possivel_mitigacao?: string; // Como o gap poderia ser superado
}

export interface AnaliseGapsCompleta {
  total_gaps: number;
  gaps_eliminatorios: GapAnalise[];
  gaps_para_avaliar: GapAnalise[];
  gaps_aceitaveis: GapAnalise[];
  resumo_gaps: string;
  recomendacao_analista: string;
}

export interface RecomendacaoFinal {
  recomendacao: 'APROVAR' | 'REPROVAR' | 'REAVALIAR';
  score_final: number;
  confianca: number;
  pontos_fortes: string[];
  pontos_atencao: string[];
  justificativa: string;
  proximos_passos: string;
  // Análise de GAPs detalhada
  analise_gaps: AnaliseGapsCompleta;
}

export interface AnaliseRisco {
  nivel_risco: 'BAIXO' | 'MEDIO' | 'ALTO';
  score_risco: number;
  riscos_identificados: {
    tipo: string;
    descricao: string;
    severidade: 'BAIXA' | 'MEDIA' | 'ALTA';
    mitigacao: string;
  }[];
  red_flags: string[];
  pontos_positivos: string[];
  recomendacao: string;
}

export interface AvaliacaoEntrevista {
  score_geral: number;
  scores_por_competencia: {
    tecnico: number;
    comunicacao: number;
    problema_solving: number;
    fit_cultural: number;
  };
  destaques_positivos: string[];
  areas_preocupacao: string[];
  analise_comportamental: string;
  recomendacao: 'APROVAR' | 'REPROVAR' | 'SEGUNDA_ENTREVISTA';
  justificativa: string;
  perguntas_followup: string[];
  gaps_identificados_entrevista: GapAnalise[];
}

export interface PerguntaTecnica {
  pergunta: string;
  tipo: 'TECNICA' | 'COMPORTAMENTAL' | 'SITUACIONAL';
  dificuldade: 'FACIL' | 'MEDIA' | 'DIFICIL';
  competencia_avaliada: string;
  resposta_esperada: string;
  red_flags: string[];
}

export interface JustificativaCliente {
  resumo_executivo: string;
  pontos_destaque: string[];
  consideracoes: string[];
  gaps_relevantes: string[];
  recomendacao_cliente: string;
  texto_email: string;
}

export interface AnaliseFitCultural {
  score_fit: number;
  compatibilidades: string[];
  potenciais_conflitos: string[];
  recomendacoes_onboarding: string[];
  analise_detalhada: string;
}

export interface DadosCandidato {
  id?: string;
  nome: string;
  email?: string;
  titulo_profissional?: string;
  senioridade?: string;
  resumo_profissional?: string;
  skills?: string[];
  experiencias?: {
    empresa: string;
    cargo: string;
    periodo: string;
    descricao?: string;
  }[];
  formacao?: {
    instituicao: string;
    curso: string;
    nivel: string;
    conclusao?: string;
  }[];
  idiomas?: {
    idioma: string;
    nivel: string;
  }[];
  pretensao_salarial?: number;
  disponibilidade?: string;
  modalidade_preferida?: string;
  cidade?: string;
  estado?: string;
}

export interface DadosVaga {
  id?: string;
  titulo: string;
  descricao?: string;
  requisitos_obrigatorios?: string[];
  requisitos_desejaveis?: string[];
  skills_requeridas?: string[];
  senioridade?: string;
  faixa_salarial_min?: number;
  faixa_salarial_max?: number;
  modalidade?: string;
  local?: string;
  cliente_nome?: string;
  cultura_empresa?: string;
}

export interface DadosEmpresa {
  nome: string;
  cultura?: string;
  valores?: string[];
  ambiente?: string;
  beneficios?: string[];
}

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const CLAUDE_MODEL = 'claude-3-5-haiku-20241022';
const MAX_TOKENS = 4096;
const API_URL = '/api/claude-analyze'; // Endpoint backend

// ============================================================
// FUNÇÃO AUXILIAR - Chamada ao Backend
// ============================================================

async function callClaudeAPI(action: string, payload: any): Promise<any> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, payload }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error(`❌ Erro Claude API [${action}]:`, error.message);
    throw error;
  }
}

// ============================================================
// RECOMENDAÇÃO FINAL COM ANÁLISE DE GAPS
// ============================================================

export async function recomendarDecisaoFinal(
  candidato: DadosCandidato,
  vaga: DadosVaga,
  scoreInicial: number
): Promise<RecomendacaoFinal> {
  console.log('🔵 Claude: Analisando candidato com GAPs detalhados...');

  const result = await callClaudeAPI('recomendar_decisao_final', {
    candidato,
    vaga,
    scoreInicial
  });

  console.log(`✅ Claude: Recomendação ${result.recomendacao} (${result.analise_gaps.total_gaps} GAPs identificados)`);
  
  return result;
}

// ============================================================
// ANÁLISE DE RISCO DETALHADA
// ============================================================

export async function analisarRiscoDetalhado(
  candidato: DadosCandidato,
  vaga: DadosVaga
): Promise<AnaliseRisco> {
  console.log('🔵 Claude: Analisando riscos do candidato...');

  const result = await callClaudeAPI('analisar_risco', {
    candidato,
    vaga
  });

  console.log(`✅ Claude: Risco ${result.nivel_risco} (${result.riscos_identificados.length} riscos)`);
  
  return result;
}

// ============================================================
// AVALIAÇÃO DE ENTREVISTA
// ============================================================

export async function avaliarEntrevista(
  transcricao: string,
  perguntas: PerguntaTecnica[],
  vaga: DadosVaga,
  candidato?: DadosCandidato
): Promise<AvaliacaoEntrevista> {
  console.log('🔵 Claude: Avaliando entrevista...');

  const result = await callClaudeAPI('avaliar_entrevista', {
    transcricao,
    perguntas,
    vaga,
    candidato
  });

  console.log(`✅ Claude: Entrevista avaliada - Score ${result.score_geral}`);
  
  return result;
}

// ============================================================
// GERAÇÃO DE PERGUNTAS TÉCNICAS
// ============================================================

export async function gerarPerguntasTecnicas(
  vaga: DadosVaga,
  candidato: DadosCandidato,
  quantidade: number = 10,
  focalizarGaps: boolean = true
): Promise<PerguntaTecnica[]> {
  console.log('🔵 Claude: Gerando perguntas técnicas personalizadas...');

  const result = await callClaudeAPI('gerar_perguntas_tecnicas', {
    vaga,
    candidato,
    quantidade,
    focalizarGaps
  });

  console.log(`✅ Claude: ${result.length} perguntas geradas`);
  
  return result;
}

// ============================================================
// MATCH DETALHADO VAGA × CANDIDATO
// ============================================================

export async function matchDetalhadoVagaCandidato(
  candidato: DadosCandidato,
  vaga: DadosVaga
): Promise<RecomendacaoFinal> {
  console.log('🔵 Claude: Realizando match detalhado...');

  // Usa a mesma lógica de recomendação com foco em GAPs
  const result = await callClaudeAPI('match_detalhado', {
    candidato,
    vaga
  });

  console.log(`✅ Claude: Match concluído - Score ${result.score_final}`);
  
  return result;
}

// ============================================================
// JUSTIFICATIVA PARA CLIENTE
// ============================================================

export async function gerarJustificativaCliente(
  candidato: DadosCandidato,
  vaga: DadosVaga,
  decisao: 'ENVIAR' | 'NAO_ENVIAR',
  motivos: string[],
  gapsRelevantes?: GapAnalise[]
): Promise<JustificativaCliente> {
  console.log('🔵 Claude: Gerando justificativa para cliente...');

  const result = await callClaudeAPI('justificativa_cliente', {
    candidato,
    vaga,
    decisao,
    motivos,
    gapsRelevantes
  });

  console.log(`✅ Claude: Justificativa gerada`);
  
  return result;
}

// ============================================================
// ANÁLISE DE FIT CULTURAL
// ============================================================

export async function analisarFitCultural(
  candidato: DadosCandidato,
  empresa: DadosEmpresa
): Promise<AnaliseFitCultural> {
  console.log('🔵 Claude: Analisando fit cultural...');

  const result = await callClaudeAPI('analisar_fit_cultural', {
    candidato,
    empresa
  });

  console.log(`✅ Claude: Fit cultural analisado - Score ${result.score_fit}`);
  
  return result;
}

// ============================================================
// ANÁLISE APENAS DE GAPS (Função Auxiliar)
// ============================================================

export async function analisarGapsApenas(
  candidato: DadosCandidato,
  vaga: DadosVaga
): Promise<AnaliseGapsCompleta> {
  console.log('🔵 Claude: Analisando GAPs específicos...');

  const result = await callClaudeAPI('analisar_gaps', {
    candidato,
    vaga
  });

  console.log(`✅ Claude: ${result.total_gaps} GAPs identificados`);
  
  return result;
}

// ============================================================
// HELPER: Formatar GAPs para exibição
// ============================================================

export function formatarGapsParaExibicao(gaps: AnaliseGapsCompleta): {
  eliminatorios: string[];
  paraAvaliar: string[];
  aceitaveis: string[];
  resumo: string;
} {
  return {
    eliminatorios: gaps.gaps_eliminatorios.map(g => 
      `❌ ${g.categoria}: ${g.requisito_vaga} - ${g.justificativa}`
    ),
    paraAvaliar: gaps.gaps_para_avaliar.map(g => 
      `⚠️ ${g.categoria}: ${g.requisito_vaga} - ${g.justificativa}${g.pergunta_sugerida ? ` | Investigar: "${g.pergunta_sugerida}"` : ''}`
    ),
    aceitaveis: gaps.gaps_aceitaveis.map(g => 
      `✓ ${g.categoria}: ${g.requisito_vaga} - ${g.justificativa}`
    ),
    resumo: gaps.resumo_gaps
  };
}

// ============================================================
// HELPER: Verificar se candidato deve ser desqualificado
// ============================================================

export function verificarDesqualificacao(gaps: AnaliseGapsCompleta): {
  desqualificado: boolean;
  motivos: string[];
  precisaAvaliacao: boolean;
  perguntasParaAnalista: string[];
} {
  const desqualificado = gaps.gaps_eliminatorios.length > 0;
  const motivos = gaps.gaps_eliminatorios.map(g => g.justificativa);
  const precisaAvaliacao = gaps.gaps_para_avaliar.length > 0;
  const perguntasParaAnalista = gaps.gaps_para_avaliar
    .filter(g => g.pergunta_sugerida)
    .map(g => g.pergunta_sugerida!);

  return {
    desqualificado,
    motivos,
    precisaAvaliacao,
    perguntasParaAnalista
  };
}

// ============================================================
// EXPORT DEFAULT
// ============================================================

const claudeService = {
  recomendarDecisaoFinal,
  analisarRiscoDetalhado,
  avaliarEntrevista,
  gerarPerguntasTecnicas,
  matchDetalhadoVagaCandidato,
  gerarJustificativaCliente,
  analisarFitCultural,
  analisarGapsApenas,
  formatarGapsParaExibicao,
  verificarDesqualificacao
};

export default claudeService;
