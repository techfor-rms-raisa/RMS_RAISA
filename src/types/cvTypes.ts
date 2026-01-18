/**
 * cvTypes.ts - Tipos para Geração de CV Padronizado
 * 
 * 🆕 v59.0 - NOVOS CAMPOS:
 * - RequisitoMatch.observacao: Campo para observações detalhadas por requisito
 * - ExperienciaCV.motivo_saida: Campo para motivo de saída por experiência
 * - Suporte a 3 templates: Techfor Simples, Techfor Detalhado, T-Systems
 * 
 * Versão: 2.0
 * Data: 18/01/2026
 */

// ============================================
// DADOS DO CANDIDATO (Base para todos os templates)
// ============================================

export interface DadosCandidatoTechfor {
  // === Dados Pessoais ===
  nome: string;
  email?: string;
  telefone?: string;
  celular?: string;
  idade?: number;
  estado_civil?: 'solteiro' | 'casado' | 'divorciado' | 'viuvo' | 'uniao_estavel';
  cidade?: string;
  estado?: string;
  disponibilidade?: string;
  modalidade_trabalho?: 'presencial' | 'remoto' | 'hibrido';
  pretensao_salarial?: string;
  
  // === Perfil Profissional ===
  titulo_profissional?: string;
  titulo_vaga?: string;       // Título da vaga (usado no header)
  codigo_vaga?: string;       // Código da vaga
  cliente_destino?: string;   // Cliente destino
  gestor_destino?: string;    // Gestor do cliente
  resumo?: string;
  linkedin_url?: string;
  foto_url?: string;
  
  // === PARECER DE SELEÇÃO ===
  parecer_selecao?: string; // Texto do recrutador sobre o candidato
  
  // === RECOMENDAÇÃO FINAL ===
  recomendacao_final?: string; // "Recomendamos o [NOME]..."
  participando_outros_processos?: boolean;
  participando_processo_cliente?: boolean;
  
  // === REQUISITOS MATCH (com observação) ===
  requisitos_match?: RequisitoMatch[];
  requisitos_desejaveis?: RequisitoDesejavel[];
  
  // === Experiências (com motivo_saida) ===
  experiencias?: ExperienciaCV[];
  
  // === Formação ===
  formacao_academica?: FormacaoCV[];
  formacao_complementar?: CertificacaoCV[]; // Cursos livres, certificações
  
  // === Skills ===
  habilidades?: HabilidadeCV[];
  hard_skills_tabela?: {
    tecnologia: string;
    tempo_experiencia: string;
  }[];
  
  // === Idiomas ===
  idiomas?: IdiomaCV[];
  
  // === Informações Adicionais ===
  nivel_hierarquico?: 'junior' | 'pleno' | 'senior' | 'especialista' | 'coordenador' | 'gerente';
  informacoes_adicionais?: string[];
}

// ============================================
// REQUISITOS MANDATÓRIOS (com observação)
// ============================================

export interface RequisitoMatch {
  tecnologia: string;
  requerido: boolean;
  atendido: boolean;
  tempo_experiencia?: string;     // Ex: "+ 5 anos"
  observacao?: string;            // 🆕 v59.0: Observação detalhada
  nivel_candidato?: 'basico' | 'intermediario' | 'avancado' | 'especialista';
  ordem?: number;
}

// ============================================
// REQUISITOS DESEJÁVEIS
// ============================================

export interface RequisitoDesejavel {
  tecnologia: string;
  tempo_experiencia?: string;
  atendido?: boolean;
  ordem?: number;
}

// ============================================
// EXPERIÊNCIAS (com motivo_saida)
// ============================================

export interface ExperienciaCV {
  empresa: string;
  cargo: string;
  cliente?: string;           // Cliente onde estava alocado (se consultoria)
  data_inicio: string;        // "MM/AAAA"
  data_fim?: string;          // "MM/AAAA" ou null se atual
  atual: boolean;
  descricao?: string;
  principais_atividades?: string[];
  tecnologias?: string[];
  motivo_saida?: string;      // 🆕 v59.0: Motivo da saída
  ordem?: number;
}

// ============================================
// FORMAÇÃO ACADÊMICA
// ============================================

export interface FormacaoCV {
  tipo: 'tecnico' | 'graduacao' | 'pos_graduacao' | 'mba' | 'mestrado' | 'doutorado' | 'curso_livre';
  curso: string;
  instituicao: string;
  data_conclusao?: string;    // "AAAA"
  em_andamento: boolean;
  concluido?: 'S' | 'N';      // Para tabela do CV
}

// ============================================
// CERTIFICAÇÕES / CURSOS COMPLEMENTARES
// ============================================

export interface CertificacaoCV {
  nome: string;
  instituicao?: string;
  ano_conclusao?: string;
  codigo_certificacao?: string;
}

// ============================================
// HABILIDADES / SKILLS
// ============================================

export interface HabilidadeCV {
  nome: string;
  nivel?: 'basico' | 'intermediario' | 'avancado' | 'especialista';
  categoria?: 'linguagem' | 'framework' | 'banco' | 'cloud' | 'ferramenta' | 'metodologia' | 'soft_skill';
  anos_experiencia?: number;
}

// ============================================
// IDIOMAS
// ============================================

export interface IdiomaCV {
  idioma: string;
  nivel: 'basico' | 'intermediario' | 'avancado' | 'fluente' | 'nativo';
  certificacao?: string;
  possui_certificacao?: 'S' | 'N';
}

// ============================================
// CONFIGURAÇÃO DO TEMPLATE
// ============================================

export type TemplateType = 'techfor_simples' | 'techfor_detalhado' | 'tsystems';

export interface CVTemplateConfig {
  id: number;
  nome: string;
  tipo: TemplateType;
  descricao?: string;
  
  // Cores
  cor_primaria: string;
  cor_secundaria: string;
  cor_texto: string;
  cor_fundo: string;
  cor_header: string;
  cor_tabela_header: string;
  cor_tabela_alt: string;
  
  // Logos
  logo_techfor_url?: string;
  logo_cliente_url?: string;
  mostrar_logo_techfor: boolean;
  mostrar_logo_cliente: boolean;
  
  // Layout
  fonte: string;
  tamanho_fonte_base: number;
  mostrar_capa: boolean;
  mostrar_foto: boolean;
  usar_fundo_padrao: boolean;   // 🆕 v59.0: Usar fundo padrão TechFor
  
  // Seções visíveis
  secoes: {
    capa: boolean;
    header_dados: boolean;
    parecer_selecao: boolean;
    requisitos_mandatorios: boolean;
    requisitos_desejaveis: boolean;
    coluna_observacao: boolean;       // 🆕 v59.0: Coluna de observação
    hard_skills_tabela: boolean;
    formacao_academica: boolean;
    formacao_complementar: boolean;
    idiomas: boolean;
    historico_profissional: boolean;
    motivo_saida: boolean;            // 🆕 v59.0: Campo motivo de saída
    recomendacao_final: boolean;
    informacoes_adicionais: boolean;
  };
  
  // Textos padrão
  texto_recomendacao_padrao?: string;
  texto_rodape?: string;
}

// ============================================
// TEMPLATES PRÉ-DEFINIDOS
// ============================================

/**
 * TEMPLATE TECHFOR SIMPLES (Modelo 1)
 * - Requisitos Mandatórios: Tecnologia + Tempo (sem observação)
 * - Experiências: Sem motivo de saída
 * - Fundo padrão TechFor
 */
export const TEMPLATE_TECHFOR_SIMPLES: Partial<CVTemplateConfig> = {
  nome: 'TechFor Simples',
  tipo: 'techfor_simples',
  descricao: 'CV padrão com tabela de requisitos básica',
  cor_primaria: '#E31837',
  cor_secundaria: '#1a1a1a',
  cor_texto: '#333333',
  cor_fundo: '#FFFFFF',
  cor_header: '#E31837',
  cor_tabela_header: '#FFF3CD',
  cor_tabela_alt: '#F8F9FA',
  mostrar_logo_techfor: true,
  mostrar_logo_cliente: false,
  mostrar_capa: false,
  usar_fundo_padrao: true,
  fonte: 'Arial, sans-serif',
  secoes: {
    capa: false,
    header_dados: true,
    parecer_selecao: true,
    requisitos_mandatorios: true,
    requisitos_desejaveis: true,
    coluna_observacao: false,         // ❌ Sem observação
    hard_skills_tabela: false,
    formacao_academica: true,
    formacao_complementar: true,
    idiomas: true,
    historico_profissional: true,
    motivo_saida: false,              // ❌ Sem motivo de saída
    recomendacao_final: true,
    informacoes_adicionais: true
  },
  texto_recomendacao_padrao: 'Recomendamos o(a) {NOME}, pois demonstrou ser um(a) profissional com experiência considerável nas principais tecnologias solicitadas para a posição supracitada.',
  texto_rodape: 'Avenida Paulista, 1.765 - 7º andar - Conjunto 72 - Bela Vista - São Paulo - SP - Cep 01311-930\n(11) 3138-5800 - www.techforti.com.br'
};

/**
 * TEMPLATE TECHFOR DETALHADO (Modelo 2)
 * - Requisitos Mandatórios: Tecnologia + Tempo + Observação
 * - Experiências: Com motivo de saída
 * - Fundo padrão TechFor
 */
export const TEMPLATE_TECHFOR_DETALHADO: Partial<CVTemplateConfig> = {
  nome: 'TechFor Detalhado',
  tipo: 'techfor_detalhado',
  descricao: 'CV completo com observações e motivos de saída',
  cor_primaria: '#E31837',
  cor_secundaria: '#1a1a1a',
  cor_texto: '#333333',
  cor_fundo: '#FFFFFF',
  cor_header: '#E31837',
  cor_tabela_header: '#FFF3CD',
  cor_tabela_alt: '#F8F9FA',
  mostrar_logo_techfor: true,
  mostrar_logo_cliente: false,
  mostrar_capa: false,
  usar_fundo_padrao: true,
  fonte: 'Arial, sans-serif',
  secoes: {
    capa: false,
    header_dados: true,
    parecer_selecao: true,
    requisitos_mandatorios: true,
    requisitos_desejaveis: true,
    coluna_observacao: true,          // ✅ Com observação
    hard_skills_tabela: false,
    formacao_academica: true,
    formacao_complementar: true,
    idiomas: true,
    historico_profissional: true,
    motivo_saida: true,               // ✅ Com motivo de saída
    recomendacao_final: true,
    informacoes_adicionais: true
  },
  texto_recomendacao_padrao: 'Recomendamos o(a) {NOME}, pois demonstrou ser um(a) profissional com experiência considerável nas principais tecnologias solicitadas para a posição supracitada.',
  texto_rodape: 'Avenida Paulista, 1.765 - 7º andar - Conjunto 72 - Bela Vista - São Paulo - SP - Cep 01311-930\n(11) 3138-5800 - www.techforti.com.br'
};

/**
 * TEMPLATE T-SYSTEMS
 * - Layout magenta com capa
 * - Tabela de hard skills
 * - Sem requisitos mandatórios/desejáveis
 */
export const TEMPLATE_TSYSTEMS: Partial<CVTemplateConfig> = {
  nome: 'T-Systems',
  tipo: 'tsystems',
  descricao: 'Template T-Systems com capa e hard skills',
  cor_primaria: '#E20074',
  cor_secundaria: '#E20074',
  cor_texto: '#333333',
  cor_fundo: '#FFFFFF',
  cor_header: '#E20074',
  cor_tabela_header: '#E20074',
  cor_tabela_alt: '#FDF2F8',
  mostrar_logo_techfor: false,
  mostrar_logo_cliente: true,
  mostrar_capa: true,
  usar_fundo_padrao: false,
  fonte: 'Arial, sans-serif',
  secoes: {
    capa: true,
    header_dados: false,
    parecer_selecao: false,
    requisitos_mandatorios: false,
    requisitos_desejaveis: false,
    coluna_observacao: false,
    hard_skills_tabela: true,
    formacao_academica: true,
    formacao_complementar: false,
    idiomas: true,
    historico_profissional: true,
    motivo_saida: false,
    recomendacao_final: true,
    informacoes_adicionais: true
  },
  texto_recomendacao_padrao: 'Recomendamos o(a) {NOME}, pois demonstrou ser um(a) profissional com experiência considerável nas principais tecnologias solicitadas para a posição supracitada.'
};

// ============================================
// CV GERADO (Persistência)
// ============================================

export interface CVGeradoCompleto {
  id: number;
  candidatura_id: number;
  template_id: number;
  template_tipo: TemplateType;
  
  // Dados processados
  dados: DadosCandidatoTechfor;
  
  // HTML gerado
  cv_html: string;
  cv_capa_html?: string;
  
  // URLs
  cv_original_url?: string;
  cv_padronizado_url?: string;
  cv_pdf_url?: string;
  
  // Status
  aprovado?: boolean;
  aprovado_por?: number;
  aprovado_em?: string;
  
  // Versionamento
  versao: number;
  gerado_em: string;
  gerado_por?: number;
  
  // Metadata
  metadados?: {
    tempo_geracao_ms?: number;
    modelo_ia?: string;
    ultima_edicao_em?: string;
    ultima_edicao_por?: number;
  };
}

// ============================================
// HELPERS
// ============================================

export const ESTADOS_CIVIS = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'uniao_estavel', label: 'União Estável' }
];

export const NIVEIS_HIERARQUICOS = [
  { value: 'junior', label: 'Júnior' },
  { value: 'pleno', label: 'Pleno' },
  { value: 'senior', label: 'Sênior' },
  { value: 'especialista', label: 'Especialista' },
  { value: 'coordenador', label: 'Coordenador' },
  { value: 'gerente', label: 'Gerente' }
];

export const TIPOS_FORMACAO = [
  { value: 'tecnico', label: 'Técnico' },
  { value: 'graduacao', label: 'Graduação' },
  { value: 'pos_graduacao', label: 'Pós-Graduação' },
  { value: 'mba', label: 'MBA' },
  { value: 'mestrado', label: 'Mestrado' },
  { value: 'doutorado', label: 'Doutorado' },
  { value: 'curso_livre', label: 'Curso Livre' }
];

export const NIVEIS_IDIOMA = [
  { value: 'basico', label: 'Básico' },
  { value: 'intermediario', label: 'Intermediário' },
  { value: 'avancado', label: 'Avançado' },
  { value: 'fluente', label: 'Fluente' },
  { value: 'nativo', label: 'Nativo' }
];

export const MODALIDADES_TRABALHO = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'remoto', label: 'Remoto' },
  { value: 'hibrido', label: 'Híbrido' }
];

// ============================================
// TEMPLATES DISPONÍVEIS PARA SELEÇÃO
// ============================================

export const TEMPLATES_DISPONIVEIS = [
  {
    id: 'techfor_simples',
    nome: 'TechFor Simples',
    descricao: 'Padrão com tabela de requisitos básica',
    cor: '#E31837',
    icone: '📄',
    tags: ['Parecer', 'Requisitos', 'Rodapé']
  },
  {
    id: 'techfor_detalhado',
    nome: 'TechFor Detalhado',
    descricao: 'Completo com observações e motivos de saída',
    cor: '#E31837',
    icone: '📋',
    tags: ['Observações', 'Motivo Saída', 'Detalhado']
  },
  {
    id: 'tsystems',
    nome: 'T-Systems',
    descricao: 'Layout T-Systems com capa e hard skills',
    cor: '#E20074',
    icone: '🎯',
    tags: ['Capa', 'Hard Skills', 'Protocolo']
  }
];
