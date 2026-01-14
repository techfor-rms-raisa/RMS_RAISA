/**
 * matchingInteligenteService.ts - Serviço de Matching Inteligente
 * 
 * OBJETIVO: Calcular score de compatibilidade entre candidato e vaga
 * considerando NÃO APENAS skills, mas também:
 * - Compatibilidade de FUNÇÃO/CARGO
 * - Categorização de skills (Core, Obrigatória, Desejável)
 * - Área de atuação
 * 
 * Versão: 1.0
 * Data: 14/01/2026
 * Sprint: 3 - Otimização de Matching
 */

// ============================================================
// TIPOS
// ============================================================

export type AreaAtuacao = 
  | 'DESENVOLVIMENTO_BACKEND'
  | 'DESENVOLVIMENTO_FRONTEND'
  | 'DESENVOLVIMENTO_FULLSTACK'
  | 'DESENVOLVIMENTO_MOBILE'
  | 'DADOS_BI'
  | 'DADOS_ENGENHARIA'
  | 'DADOS_CIENCIA'
  | 'INFRAESTRUTURA_DEVOPS'
  | 'INFRAESTRUTURA_CLOUD'
  | 'INFRAESTRUTURA_REDES'
  | 'SEGURANCA'
  | 'QA_TESTES'
  | 'UX_UI'
  | 'GESTAO_PROJETOS'
  | 'GESTAO_PRODUTOS'
  | 'SUPORTE_HELPDESK'
  | 'SAP_ERP'
  | 'OUTRO';

export interface SkillCategoria {
  nome: string;
  categoria: 'CORE' | 'OBRIGATORIA' | 'DESEJAVEL' | 'GENERICA';
  area: AreaAtuacao[];
}

export interface ScoreDetalhado {
  score_total: number;
  score_funcao: number;
  score_core: number;
  score_obrigatorias: number;
  score_desejaveis: number;
  area_candidato: AreaAtuacao;
  area_vaga: AreaAtuacao;
  compativel: boolean;
  motivo_incompatibilidade?: string;
  skills_core_atendidas: string[];
  skills_core_faltantes: string[];
  skills_obrig_atendidas: string[];
  skills_desej_atendidas: string[];
}

// ============================================================
// MAPEAMENTOS
// ============================================================

/**
 * Mapeamento de palavras-chave para área de atuação
 * Usado para identificar a área a partir do título do cargo
 */
const MAPA_AREA_PALAVRAS: Record<string, AreaAtuacao[]> = {
  // DESENVOLVIMENTO BACKEND
  'backend': ['DESENVOLVIMENTO_BACKEND'],
  'back-end': ['DESENVOLVIMENTO_BACKEND'],
  'back end': ['DESENVOLVIMENTO_BACKEND'],
  'php': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'java': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'python': ['DESENVOLVIMENTO_BACKEND', 'DADOS_CIENCIA', 'DADOS_ENGENHARIA'],
  'node': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'nodejs': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'c#': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'csharp': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK'],
  '.net': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'dotnet': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'ruby': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'golang': ['DESENVOLVIMENTO_BACKEND'],
  'go lang': ['DESENVOLVIMENTO_BACKEND'],
  'rust': ['DESENVOLVIMENTO_BACKEND'],
  
  // DESENVOLVIMENTO FRONTEND
  'frontend': ['DESENVOLVIMENTO_FRONTEND'],
  'front-end': ['DESENVOLVIMENTO_FRONTEND'],
  'front end': ['DESENVOLVIMENTO_FRONTEND'],
  'react': ['DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'angular': ['DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'vue': ['DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'vuejs': ['DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'vue.js': ['DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK'],
  
  // DESENVOLVIMENTO FULLSTACK
  'fullstack': ['DESENVOLVIMENTO_FULLSTACK'],
  'full-stack': ['DESENVOLVIMENTO_FULLSTACK'],
  'full stack': ['DESENVOLVIMENTO_FULLSTACK'],
  
  // DESENVOLVIMENTO MOBILE
  'mobile': ['DESENVOLVIMENTO_MOBILE'],
  'android': ['DESENVOLVIMENTO_MOBILE'],
  'ios': ['DESENVOLVIMENTO_MOBILE'],
  'flutter': ['DESENVOLVIMENTO_MOBILE'],
  'react native': ['DESENVOLVIMENTO_MOBILE'],
  'kotlin': ['DESENVOLVIMENTO_MOBILE', 'DESENVOLVIMENTO_BACKEND'],
  'swift': ['DESENVOLVIMENTO_MOBILE'],
  
  // DADOS
  'dados': ['DADOS_BI', 'DADOS_ENGENHARIA', 'DADOS_CIENCIA'],
  'data': ['DADOS_BI', 'DADOS_ENGENHARIA', 'DADOS_CIENCIA'],
  'bi': ['DADOS_BI'],
  'business intelligence': ['DADOS_BI'],
  'analytics': ['DADOS_BI', 'DADOS_CIENCIA'],
  'cientista': ['DADOS_CIENCIA'],
  'scientist': ['DADOS_CIENCIA'],
  'machine learning': ['DADOS_CIENCIA'],
  'ml': ['DADOS_CIENCIA'],
  'engenheiro de dados': ['DADOS_ENGENHARIA'],
  'data engineer': ['DADOS_ENGENHARIA'],
  'etl': ['DADOS_ENGENHARIA'],
  'dataops': ['DADOS_ENGENHARIA'],
  'power bi': ['DADOS_BI'],
  'tableau': ['DADOS_BI'],
  
  // INFRAESTRUTURA
  'devops': ['INFRAESTRUTURA_DEVOPS'],
  'sre': ['INFRAESTRUTURA_DEVOPS'],
  'site reliability': ['INFRAESTRUTURA_DEVOPS'],
  'cloud': ['INFRAESTRUTURA_CLOUD'],
  'aws': ['INFRAESTRUTURA_CLOUD'],
  'azure': ['INFRAESTRUTURA_CLOUD'],
  'gcp': ['INFRAESTRUTURA_CLOUD'],
  'infraestrutura': ['INFRAESTRUTURA_DEVOPS', 'INFRAESTRUTURA_CLOUD', 'INFRAESTRUTURA_REDES'],
  'infra': ['INFRAESTRUTURA_DEVOPS', 'INFRAESTRUTURA_CLOUD', 'INFRAESTRUTURA_REDES'],
  'redes': ['INFRAESTRUTURA_REDES'],
  'network': ['INFRAESTRUTURA_REDES'],
  'linux': ['INFRAESTRUTURA_DEVOPS'],
  'kubernetes': ['INFRAESTRUTURA_DEVOPS'],
  'k8s': ['INFRAESTRUTURA_DEVOPS'],
  'docker': ['INFRAESTRUTURA_DEVOPS'],
  'terraform': ['INFRAESTRUTURA_DEVOPS', 'INFRAESTRUTURA_CLOUD'],
  
  // SEGURANÇA
  'seguranca': ['SEGURANCA'],
  'security': ['SEGURANCA'],
  'cybersecurity': ['SEGURANCA'],
  'pentest': ['SEGURANCA'],
  'devsecops': ['SEGURANCA', 'INFRAESTRUTURA_DEVOPS'],
  
  // QA/TESTES
  'qa': ['QA_TESTES'],
  'quality': ['QA_TESTES'],
  'testes': ['QA_TESTES'],
  'teste': ['QA_TESTES'],
  'test': ['QA_TESTES'],
  'automacao': ['QA_TESTES'],
  'automation': ['QA_TESTES'],
  'selenium': ['QA_TESTES'],
  'cypress': ['QA_TESTES'],
  
  // UX/UI
  'ux': ['UX_UI'],
  'ui': ['UX_UI'],
  'design': ['UX_UI'],
  'designer': ['UX_UI'],
  'figma': ['UX_UI'],
  'user experience': ['UX_UI'],
  'user interface': ['UX_UI'],
  'prototipo': ['UX_UI'],
  
  // GESTÃO
  'scrum': ['GESTAO_PROJETOS'],
  'agile': ['GESTAO_PROJETOS'],
  'gerente de projetos': ['GESTAO_PROJETOS'],
  'project manager': ['GESTAO_PROJETOS'],
  'pm': ['GESTAO_PROJETOS', 'GESTAO_PRODUTOS'],
  'product': ['GESTAO_PRODUTOS'],
  'produto': ['GESTAO_PRODUTOS'],
  'product owner': ['GESTAO_PRODUTOS'],
  'po': ['GESTAO_PRODUTOS'],
  'product manager': ['GESTAO_PRODUTOS'],
  
  // SAP/ERP
  'sap': ['SAP_ERP'],
  'abap': ['SAP_ERP'],
  'erp': ['SAP_ERP'],
  'hana': ['SAP_ERP'],
  'fiori': ['SAP_ERP'],
  
  // SUPORTE
  'suporte': ['SUPORTE_HELPDESK'],
  'support': ['SUPORTE_HELPDESK'],
  'helpdesk': ['SUPORTE_HELPDESK'],
  'help desk': ['SUPORTE_HELPDESK'],
  'service desk': ['SUPORTE_HELPDESK'],
  
  // GENÉRICOS (podem ser várias áreas)
  'desenvolvedor': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'developer': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'programador': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'engineer': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK', 'INFRAESTRUTURA_DEVOPS'],
  'engenheiro': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK', 'INFRAESTRUTURA_DEVOPS'],
  'analista': ['DESENVOLVIMENTO_BACKEND', 'DADOS_BI', 'QA_TESTES', 'SUPORTE_HELPDESK'],
  'arquiteto': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK', 'INFRAESTRUTURA_CLOUD'],
  'architect': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK', 'INFRAESTRUTURA_CLOUD'],
  'tech lead': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'lead': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK', 'GESTAO_PROJETOS'],
};

/**
 * Skills que identificam uma área específica (skills CORE)
 */
const SKILLS_CORE_POR_AREA: Record<AreaAtuacao, string[]> = {
  'DESENVOLVIMENTO_BACKEND': ['php', 'java', 'python', 'c#', 'csharp', '.net', 'node', 'nodejs', 'ruby', 'golang', 'go', 'rust', 'spring', 'laravel', 'django', 'express', 'fastapi', 'nestjs'],
  'DESENVOLVIMENTO_FRONTEND': ['react', 'angular', 'vue', 'vuejs', 'vue.js', 'javascript', 'typescript', 'nextjs', 'nuxt', 'svelte'],
  'DESENVOLVIMENTO_FULLSTACK': ['react', 'angular', 'vue', 'node', 'php', 'python', 'java', 'laravel', 'django', 'spring', 'express'],
  'DESENVOLVIMENTO_MOBILE': ['android', 'ios', 'flutter', 'react native', 'kotlin', 'swift', 'xamarin', 'ionic'],
  'DADOS_BI': ['power bi', 'tableau', 'looker', 'metabase', 'sql', 'excel', 'qlik'],
  'DADOS_ENGENHARIA': ['spark', 'airflow', 'kafka', 'databricks', 'snowflake', 'bigquery', 'redshift', 'etl', 'python', 'scala'],
  'DADOS_CIENCIA': ['python', 'r', 'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy', 'machine learning', 'ml', 'deep learning'],
  'INFRAESTRUTURA_DEVOPS': ['docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'jenkins', 'gitlab ci', 'github actions', 'linux', 'shell', 'bash'],
  'INFRAESTRUTURA_CLOUD': ['aws', 'azure', 'gcp', 'google cloud', 'cloud', 'ec2', 's3', 'lambda', 'cloudformation'],
  'INFRAESTRUTURA_REDES': ['cisco', 'juniper', 'firewall', 'vpn', 'tcp/ip', 'dns', 'dhcp', 'routing', 'switching'],
  'SEGURANCA': ['pentest', 'owasp', 'siem', 'soc', 'firewall', 'waf', 'vulnerability', 'security'],
  'QA_TESTES': ['selenium', 'cypress', 'jest', 'junit', 'pytest', 'postman', 'jmeter', 'cucumber', 'robot framework', 'appium'],
  'UX_UI': ['figma', 'sketch', 'adobe xd', 'invision', 'wireframe', 'prototipo', 'design system', 'ux research'],
  'GESTAO_PROJETOS': ['jira', 'confluence', 'scrum', 'kanban', 'agile', 'pmbok', 'prince2', 'ms project'],
  'GESTAO_PRODUTOS': ['product discovery', 'roadmap', 'backlog', 'user story', 'okr', 'métricas', 'analytics'],
  'SUPORTE_HELPDESK': ['itil', 'servicenow', 'zendesk', 'freshdesk', 'ticket', 'incidente'],
  'SAP_ERP': ['abap', 'sap', 'hana', 'fiori', 'sd', 'mm', 'fi', 'co', 'pp', 'wm'],
  'OUTRO': []
};

/**
 * Skills genéricas (presentes em várias áreas, baixo peso)
 */
const SKILLS_GENERICAS = [
  'git', 'github', 'gitlab', 'bitbucket',
  'html', 'html5', 'css', 'css3', 'sass', 'less',
  'sql', 'mysql', 'postgresql', 'mongodb', 'redis',
  'api', 'rest', 'restful', 'graphql',
  'json', 'xml', 'yaml',
  'agile', 'scrum', 'kanban',
  'linux', 'windows',
  'english', 'ingles', 'inglês',
  'comunicacao', 'communication', 'teamwork', 'trabalho em equipe'
];

/**
 * Matriz de compatibilidade entre áreas
 * Define quais áreas são compatíveis entre si
 */
const MATRIZ_COMPATIBILIDADE: Record<AreaAtuacao, AreaAtuacao[]> = {
  'DESENVOLVIMENTO_BACKEND': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'DESENVOLVIMENTO_FRONTEND': ['DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'DESENVOLVIMENTO_FULLSTACK': ['DESENVOLVIMENTO_BACKEND', 'DESENVOLVIMENTO_FRONTEND', 'DESENVOLVIMENTO_FULLSTACK'],
  'DESENVOLVIMENTO_MOBILE': ['DESENVOLVIMENTO_MOBILE', 'DESENVOLVIMENTO_FRONTEND'],
  'DADOS_BI': ['DADOS_BI', 'DADOS_ENGENHARIA'],
  'DADOS_ENGENHARIA': ['DADOS_ENGENHARIA', 'DADOS_CIENCIA', 'DADOS_BI'],
  'DADOS_CIENCIA': ['DADOS_CIENCIA', 'DADOS_ENGENHARIA'],
  'INFRAESTRUTURA_DEVOPS': ['INFRAESTRUTURA_DEVOPS', 'INFRAESTRUTURA_CLOUD'],
  'INFRAESTRUTURA_CLOUD': ['INFRAESTRUTURA_CLOUD', 'INFRAESTRUTURA_DEVOPS'],
  'INFRAESTRUTURA_REDES': ['INFRAESTRUTURA_REDES', 'INFRAESTRUTURA_DEVOPS'],
  'SEGURANCA': ['SEGURANCA', 'INFRAESTRUTURA_DEVOPS'],
  'QA_TESTES': ['QA_TESTES'],
  'UX_UI': ['UX_UI'],
  'GESTAO_PROJETOS': ['GESTAO_PROJETOS', 'GESTAO_PRODUTOS'],
  'GESTAO_PRODUTOS': ['GESTAO_PRODUTOS', 'GESTAO_PROJETOS'],
  'SUPORTE_HELPDESK': ['SUPORTE_HELPDESK'],
  'SAP_ERP': ['SAP_ERP'],
  'OUTRO': ['OUTRO']
};

// ============================================================
// FUNÇÕES PRINCIPAIS
// ============================================================

/**
 * Normaliza string para comparação (lowercase, sem acentos, sem espaços extras)
 */
export function normalizar(texto: string): string {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detecta a área de atuação a partir do título do cargo
 */
export function detectarAreaAtuacao(titulo: string, skills?: string[]): AreaAtuacao {
  const tituloNorm = normalizar(titulo);
  
  // Prioridade 1: Buscar matches exatos no título
  for (const [palavra, areas] of Object.entries(MAPA_AREA_PALAVRAS)) {
    if (tituloNorm.includes(normalizar(palavra))) {
      // Se encontrou, usar skills para desambiguar
      if (areas.length === 1) {
        return areas[0];
      }
      
      // Múltiplas áreas possíveis - usar skills para decidir
      if (skills && skills.length > 0) {
        const skillsNorm = skills.map(normalizar);
        for (const area of areas) {
          const skillsCore = SKILLS_CORE_POR_AREA[area] || [];
          const temSkillCore = skillsCore.some(sc => 
            skillsNorm.some(sn => sn.includes(normalizar(sc)) || normalizar(sc).includes(sn))
          );
          if (temSkillCore) {
            return area;
          }
        }
      }
      
      // Fallback: primeira área
      return areas[0];
    }
  }
  
  // Prioridade 2: Usar skills para determinar área
  if (skills && skills.length > 0) {
    const skillsNorm = skills.map(normalizar);
    let melhorArea: AreaAtuacao = 'OUTRO';
    let melhorScore = 0;
    
    for (const [area, skillsCore] of Object.entries(SKILLS_CORE_POR_AREA)) {
      const matches = skillsCore.filter(sc => 
        skillsNorm.some(sn => sn.includes(normalizar(sc)) || normalizar(sc).includes(sn))
      ).length;
      
      if (matches > melhorScore) {
        melhorScore = matches;
        melhorArea = area as AreaAtuacao;
      }
    }
    
    if (melhorScore > 0) {
      return melhorArea;
    }
  }
  
  return 'OUTRO';
}

/**
 * Verifica se duas áreas são compatíveis
 */
export function areasCompativeis(area1: AreaAtuacao, area2: AreaAtuacao): boolean {
  if (area1 === 'OUTRO' || area2 === 'OUTRO') {
    return true; // Área indefinida é compatível com qualquer uma
  }
  
  const compativeis = MATRIZ_COMPATIBILIDADE[area1] || [];
  return compativeis.includes(area2);
}

/**
 * Categoriza as skills da vaga em Core, Obrigatórias, Desejáveis e Genéricas
 */
export function categorizarSkillsVaga(
  skills: string[],
  areaVaga: AreaAtuacao
): { core: string[], obrigatorias: string[], desejaveis: string[], genericas: string[] } {
  const skillsNorm = skills.map(normalizar);
  const skillsCoreArea = (SKILLS_CORE_POR_AREA[areaVaga] || []).map(normalizar);
  const skillsGenericasNorm = SKILLS_GENERICAS.map(normalizar);
  
  const resultado = {
    core: [] as string[],
    obrigatorias: [] as string[],
    desejaveis: [] as string[],
    genericas: [] as string[]
  };
  
  skills.forEach((skill, index) => {
    const skillNorm = skillsNorm[index];
    
    // Verificar se é skill CORE da área
    const isCore = skillsCoreArea.some(sc => 
      skillNorm.includes(sc) || sc.includes(skillNorm)
    );
    
    // Verificar se é skill genérica
    const isGenerica = skillsGenericasNorm.some(sg => 
      skillNorm.includes(sg) || sg.includes(skillNorm)
    );
    
    if (isCore) {
      resultado.core.push(skill);
    } else if (isGenerica) {
      resultado.genericas.push(skill);
    } else if (resultado.obrigatorias.length < skills.length * 0.4) {
      // Primeiras skills não-core e não-genéricas são obrigatórias (até 40%)
      resultado.obrigatorias.push(skill);
    } else {
      resultado.desejaveis.push(skill);
    }
  });
  
  return resultado;
}

/**
 * Calcula o score detalhado de compatibilidade entre candidato e vaga
 */
export function calcularScoreCompatibilidade(
  candidato: {
    titulo_profissional: string;
    skills: string[];
    senioridade?: string;
  },
  vaga: {
    titulo: string;
    stack_tecnologica: string[];
    senioridade?: string;
  }
): ScoreDetalhado {
  // 1. Detectar áreas
  const areaCandidato = detectarAreaAtuacao(candidato.titulo_profissional, candidato.skills);
  const areaVaga = detectarAreaAtuacao(vaga.titulo, vaga.stack_tecnologica);
  
  // 2. Verificar compatibilidade de área
  const compativel = areasCompativeis(areaCandidato, areaVaga);
  
  if (!compativel) {
    return {
      score_total: 0,
      score_funcao: 0,
      score_core: 0,
      score_obrigatorias: 0,
      score_desejaveis: 0,
      area_candidato: areaCandidato,
      area_vaga: areaVaga,
      compativel: false,
      motivo_incompatibilidade: `Área do candidato (${areaCandidato}) não é compatível com a vaga (${areaVaga})`,
      skills_core_atendidas: [],
      skills_core_faltantes: [],
      skills_obrig_atendidas: [],
      skills_desej_atendidas: []
    };
  }
  
  // 3. Categorizar skills da vaga
  const categorias = categorizarSkillsVaga(vaga.stack_tecnologica, areaVaga);
  
  // 4. Normalizar skills do candidato para comparação
  const skillsCandidatoNorm = candidato.skills.map(normalizar);
  
  // Função helper para verificar match de skill
  const temSkill = (skill: string): boolean => {
    const skillNorm = normalizar(skill);
    return skillsCandidatoNorm.some(sc => 
      sc.includes(skillNorm) || skillNorm.includes(sc) ||
      // Verificar variações comuns
      sc.replace(/\./g, '') === skillNorm.replace(/\./g, '') ||
      sc.replace(/js$/i, 'javascript') === skillNorm.replace(/js$/i, 'javascript')
    );
  };
  
  // 5. Calcular matches por categoria
  const coreAtendidas = categorias.core.filter(temSkill);
  const coreFaltantes = categorias.core.filter(s => !temSkill(s));
  const obrigAtendidas = categorias.obrigatorias.filter(temSkill);
  const desejAtendidas = [...categorias.desejaveis, ...categorias.genericas].filter(temSkill);
  
  // 6. Calcular scores parciais
  const scoreFuncao = compativel ? (areaCandidato === areaVaga ? 100 : 70) : 0;
  
  const scoreCore = categorias.core.length > 0 
    ? Math.round((coreAtendidas.length / categorias.core.length) * 100)
    : 100; // Se não tem core definido, considera 100%
  
  const scoreObrig = categorias.obrigatorias.length > 0
    ? Math.round((obrigAtendidas.length / categorias.obrigatorias.length) * 100)
    : 100;
  
  const totalDesejaveis = categorias.desejaveis.length + categorias.genericas.length;
  const scoreDesej = totalDesejaveis > 0
    ? Math.round((desejAtendidas.length / totalDesejaveis) * 100)
    : 100;
  
  // 7. Aplicar GATE: Se não tem NENHUMA skill core, penalizar severamente
  let penalizacao = 0;
  let motivoIncompat: string | undefined;
  
  if (categorias.core.length > 0 && coreAtendidas.length === 0) {
    penalizacao = 50; // Reduz 50 pontos se não tem nenhuma skill core
    motivoIncompat = `Candidato não possui nenhuma skill CORE da vaga: ${categorias.core.join(', ')}`;
  }
  
  // 8. Calcular score total ponderado
  // Pesos: Função 25%, Core 40%, Obrigatórias 25%, Desejáveis 10%
  let scoreTotal = Math.round(
    (scoreFuncao * 0.25) +
    (scoreCore * 0.40) +
    (scoreObrig * 0.25) +
    (scoreDesej * 0.10)
  );
  
  // Aplicar penalização
  scoreTotal = Math.max(0, scoreTotal - penalizacao);
  
  return {
    score_total: scoreTotal,
    score_funcao: scoreFuncao,
    score_core: scoreCore,
    score_obrigatorias: scoreObrig,
    score_desejaveis: scoreDesej,
    area_candidato: areaCandidato,
    area_vaga: areaVaga,
    compativel: scoreTotal >= 30, // Mínimo de 30% para ser considerado compatível
    motivo_incompatibilidade: motivoIncompat,
    skills_core_atendidas: coreAtendidas,
    skills_core_faltantes: coreFaltantes,
    skills_obrig_atendidas: obrigAtendidas,
    skills_desej_atendidas: desejAtendidas
  };
}

/**
 * Filtra e rankeia candidatos para uma vaga
 * Exclui candidatos incompatíveis e ordena por score
 */
export function filtrarERankearCandidatos(
  candidatos: Array<{
    pessoa_id: number;
    nome: string;
    titulo_profissional: string;
    skills: string[];
    senioridade?: string;
    [key: string]: any;
  }>,
  vaga: {
    titulo: string;
    stack_tecnologica: string[];
    senioridade?: string;
  },
  opcoes?: {
    scoreMinimo?: number;
    incluirIncompativeis?: boolean;
    limite?: number;
  }
): Array<{
  candidato: typeof candidatos[0];
  score: ScoreDetalhado;
}> {
  const scoreMinimo = opcoes?.scoreMinimo ?? 30;
  const incluirIncompativeis = opcoes?.incluirIncompativeis ?? false;
  const limite = opcoes?.limite ?? 20;
  
  // Calcular score para cada candidato
  const resultados = candidatos.map(candidato => ({
    candidato,
    score: calcularScoreCompatibilidade(candidato, vaga)
  }));
  
  // Filtrar incompatíveis (se não for para incluir)
  const filtrados = incluirIncompativeis 
    ? resultados 
    : resultados.filter(r => r.score.compativel && r.score.score_total >= scoreMinimo);
  
  // Ordenar por score total (decrescente)
  filtrados.sort((a, b) => b.score.score_total - a.score.score_total);
  
  // Limitar resultados
  return filtrados.slice(0, limite);
}

// ============================================================
// EXPORT DEFAULT
// ============================================================

const matchingInteligenteService = {
  normalizar,
  detectarAreaAtuacao,
  areasCompativeis,
  categorizarSkillsVaga,
  calcularScoreCompatibilidade,
  filtrarERankearCandidatos,
  // Exportar constantes para uso externo
  SKILLS_CORE_POR_AREA,
  SKILLS_GENERICAS,
  MATRIZ_COMPATIBILIDADE
};

export default matchingInteligenteService;
