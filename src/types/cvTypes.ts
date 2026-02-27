/**
 * cvTypes.ts - Tipos para Geração de CV Padronizado Techfor
 * 
 * Baseado na análise dos CVs reais:
 * - Leandro (SRE Cloud - ZAMP)
 * - Marcos (.NET - T-Systems)
 * - Victor Hugo (GP - CATENO)
 * 
 * 🔧 v3.0 (25/02/2026): Novos campos Entrevista Comportamental
 * - bairro, cep, cpf, rg, data_nascimento
 * - valor_hora_atual, pretensao_valor_hora
 * - ja_trabalhou_pj, aceita_pj, possui_empresa, aceita_abrir_empresa
 * - observacao em hard_skills_tabela
 * 
 * Versão: 3.0
 * Data: 25/02/2026
 */

// ============================================
// TIPOS BASE
// ============================================

export interface ExperienciaCV {
  empresa: string;
  cargo: string;
  data_inicio: string;
  data_fim?: string;
  atual: boolean;
  cliente?: string;
  descricao?: string;
  principais_atividades?: string[];
  tecnologias?: string[];
  motivo_saida?: string;
}

export interface FormacaoCV {
  tipo: 'tecnico' | 'graduacao' | 'pos_graduacao' | 'mba' | 'mestrado' | 'doutorado' | 'curso_livre';
  curso: string;
  instituicao: string;
  data_inicio?: string;
  data_conclusao?: string;
  em_andamento: boolean;
  concluido?: string;
}

export interface CertificacaoCV {
  nome: string;
  instituicao: string;
  data_obtencao?: string;
  ano_conclusao?: string;
}

export interface HabilidadeCV {
  nome: string;
  nivel?: 'basico' | 'intermediario' | 'avancado' | 'especialista';
  categoria?: string;
  anos_experiencia?: number;
}

export interface IdiomaCV {
  idioma: string;
  nivel: 'basico' | 'intermediario' | 'avancado' | 'fluente' | 'nativo';
  certificacao?: string;
  instituicao?: string;
  possui_certificacao?: string;
}

// ============================================
// REQUISITOS MATCH (Tabela com Observações)
// ============================================

export interface RequisitoMatch {
  tecnologia: string;
  tempo_experiencia: string;
  observacao?: string;
  tipo?: 'mandatorio' | 'desejavel';
  atendido?: boolean;
  requerido?: boolean;
}

// ============================================
// DADOS COMPLETOS DO CANDIDATO TECHFOR
// ============================================

export interface DadosCandidatoTechfor {
  // === Informações Pessoais ===
  nome: string;
  email: string;
  telefone?: string;
  celular?: string;
  idade?: number;
  data_nascimento?: string;
  estado_civil?: 'solteiro' | 'casado' | 'divorciado' | 'viuvo' | 'uniao_estavel';
  cidade?: string;
  bairro?: string;
  estado?: string;
  cep?: string;
  
  // === Documentos ===
  cpf?: string;
  rg?: string;

  // === Informações da Vaga ===
  codigo_vaga?: string;
  titulo_vaga?: string;
  gestor_destino?: string;
  cliente_destino?: string;
  
  // === Disponibilidade ===
  disponibilidade?: string;
  modalidade_trabalho?: 'presencial' | 'remoto' | 'hibrido';
  pretensao_salarial?: string;
  
  // === Financeiro / Contratação ===
  valor_hora_atual?: number;
  pretensao_valor_hora?: number;
  ja_trabalhou_pj?: boolean;
  aceita_pj?: boolean;
  possui_empresa?: boolean;
  aceita_abrir_empresa?: boolean;
  
  // === Perfil Profissional ===
  titulo_profissional?: string;
  resumo?: string;
  linkedin_url?: string;
  foto_url?: string;
  
  // === Parecer de Seleção ===
  parecer_selecao?: string;
  
  // === Recomendação Final ===
  recomendacao_final?: string;
  participando_outros_processos?: boolean;
  participando_processo_cliente?: boolean;
  
  // === Requisitos Match ===
  requisitos_match?: RequisitoMatch[];
  requisitos_desejaveis?: RequisitoMatch[];
  
  // === Experiências ===
  experiencias?: ExperienciaCV[];
  
  // === Formação ===
  formacao_academica?: FormacaoCV[];
  formacao_complementar?: CertificacaoCV[];
  
  // === Skills ===
  habilidades?: HabilidadeCV[];
  hard_skills_tabela?: {
    tecnologia: string;
    tempo_experiencia: string;
    observacao?: string;
  }[];
  
  // === Idiomas ===
  idiomas?: IdiomaCV[];
  
  // === Informações Adicionais ===
  nivel_hierarquico?: 'junior' | 'pleno' | 'senior' | 'especialista' | 'coordenador' | 'gerente';
  informacoes_adicionais?: string[];
}

// ============================================
// CONFIGURAÇÃO DO TEMPLATE
// ============================================

export interface CVTemplateConfig {
  id: number;
  nome: string;
  tipo: 'techfor' | 'tsystems' | 'cliente_custom' | 'generico';
  
  cor_primaria: string;
  cor_secundaria: string;
  cor_texto: string;
  cor_fundo: string;
  cor_header: string;
  cor_tabela_header: string;
  cor_tabela_alt: string;
  
  logo_techfor_url?: string;
  logo_cliente_url?: string;
  mostrar_logo_techfor: boolean;
  mostrar_logo_cliente: boolean;
  
  fonte: string;
  tamanho_fonte_base: number;
  mostrar_capa: boolean;
  mostrar_foto: boolean;
  
  secoes: {
    capa: boolean;
    header_dados: boolean;
    parecer_selecao: boolean;
    requisitos_mandatorios: boolean;
    requisitos_desejaveis: boolean;
    hard_skills_tabela: boolean;
    formacao_academica: boolean;
    formacao_complementar: boolean;
    idiomas: boolean;
    historico_profissional: boolean;
    recomendacao_final: boolean;
    informacoes_adicionais: boolean;
  };
  
  texto_recomendacao_padrao?: string;
  texto_rodape?: string;
}

// ============================================
// CV GERADO
// ============================================

export interface CVGeradoCompleto {
  id: number;
  candidatura_id: number;
  template_id: number;
  template_tipo: string;
  
  dados: DadosCandidatoTechfor;
  
  cv_html: string;
  cv_capa_html?: string;
  
  cv_original_url?: string;
  cv_padronizado_url?: string;
  cv_pdf_url?: string;
  
  aprovado?: boolean;
  aprovado_por?: number;
  aprovado_em?: string;
  
  versao: number;
  gerado_em: string;
  gerado_por?: number;
  
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
