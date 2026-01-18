/**
 * cvTypes.ts - Tipos para Geração de CV Padronizado Techfor
 * 
 * Baseado na análise dos CVs reais:
 * - Leandro (SRE Cloud - ZAMP)
 * - Marcos (.NET - T-Systems)
 * - Victor Hugo (GP - CATENO)
 * 
 * Versão: 2.0
 * Data: 26/12/2024
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
  cliente?: string; // Ex: "Cliente Santander"
  descricao?: string;
  principais_atividades?: string[];
  tecnologias?: string[];
  motivo_saida?: string; // NOVO: Motivo de saída
}

export interface FormacaoCV {
  tipo: 'tecnico' | 'graduacao' | 'pos_graduacao' | 'mba' | 'mestrado' | 'doutorado' | 'curso_livre';
  curso: string;
  instituicao: string;
  data_inicio?: string;
  data_conclusao?: string;
  em_andamento: boolean;
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
}

// ============================================
// NOVO: Requisitos Match (Tabela 3 colunas)
// ============================================

export interface RequisitoMatch {
  tecnologia: string;
  tempo_experiencia: string;
  observacao: string;
  tipo: 'mandatorio' | 'desejavel';
  atendido: boolean;
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
  estado?: string;
  
  // === Informações da Vaga ===
  codigo_vaga?: string;
  titulo_vaga?: string;
  gestor_destino?: string;
  cliente_destino?: string;
  
  // === Disponibilidade ===
  disponibilidade?: string; // "Imediata", "15 dias", "30 dias", "3 semanas"
  modalidade_trabalho?: 'presencial' | 'remoto' | 'hibrido';
  pretensao_salarial?: string;
  
  // === Perfil Profissional ===
  titulo_profissional?: string;
  resumo?: string;
  linkedin_url?: string;
  foto_url?: string;
  
  // === NOVO: Parecer de Seleção ===
  parecer_selecao?: string; // Texto do recrutador sobre o candidato
  
  // === NOVO: Recomendação Final ===
  recomendacao_final?: string; // "Recomendamos o [NOME]..."
  participando_outros_processos?: boolean;
  participando_processo_cliente?: boolean;
  
  // === NOVO: Requisitos Match ===
  requisitos_match?: RequisitoMatch[];
  
  // === Experiências ===
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
// CONFIGURAÇÃO DO TEMPLATE
// ============================================

export interface CVTemplateConfig {
  id: number;
  nome: string;
  tipo: 'techfor' | 'tsystems' | 'cliente_custom' | 'generico';
  
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
  
  // Seções visíveis
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
  
  // Textos padrão
  texto_recomendacao_padrao?: string;
  texto_rodape?: string;
}

// ============================================
// TEMPLATES PRÉ-DEFINIDOS
// ============================================

export const TEMPLATE_TECHFOR: Partial<CVTemplateConfig> = {
  nome: 'Template Techfor Padrão',
  tipo: 'techfor',
  cor_primaria: '#E31837', // Vermelho Techfor
  cor_secundaria: '#1a1a1a',
  cor_texto: '#333333',
  cor_fundo: '#FFFFFF',
  cor_header: '#E31837',
  cor_tabela_header: '#FFF3CD', // Amarelo claro
  cor_tabela_alt: '#F8F9FA',
  mostrar_logo_techfor: true,
  mostrar_logo_cliente: false,
  mostrar_capa: false,
  fonte: 'Arial, sans-serif',
  secoes: {
    capa: false,
    header_dados: true,
    parecer_selecao: true,
    requisitos_mandatorios: true,
    requisitos_desejaveis: true,
    hard_skills_tabela: false,
    formacao_academica: true,
    formacao_complementar: true,
    idiomas: true,
    historico_profissional: true,
    recomendacao_final: true,
    informacoes_adicionais: true
  },
  texto_recomendacao_padrao: 'Recomendamos o(a) {NOME}, pois demonstrou ser um(a) profissional com experiência considerável nas principais tecnologias solicitadas para a posição supracitada.',
  texto_rodape: 'Avenida Paulista, 1.765 - 7º andar - Conjunto 72 - Bela Vista - São Paulo - SP - Cep 01311-930\n(11) 3138-5800 - www.techforti.com.br'
};

export const TEMPLATE_TSYSTEMS: Partial<CVTemplateConfig> = {
  nome: 'Template T-Systems',
  tipo: 'tsystems',
  cor_primaria: '#E20074', // Magenta T-Systems
  cor_secundaria: '#E20074',
  cor_texto: '#333333',
  cor_fundo: '#FFFFFF',
  cor_header: '#E20074',
  cor_tabela_header: '#E20074',
  cor_tabela_alt: '#FDF2F8',
  mostrar_logo_techfor: false,
  mostrar_logo_cliente: true,
  mostrar_capa: true, // T-Systems tem capa
  fonte: 'Arial, sans-serif',
  secoes: {
    capa: true,
    header_dados: false, // Na capa
    parecer_selecao: false,
    requisitos_mandatorios: false,
    requisitos_desejaveis: false,
    hard_skills_tabela: true, // T-Systems usa tabela de hard skills
    formacao_academica: true,
    formacao_complementar: false,
    idiomas: true,
    historico_profissional: true,
    recomendacao_final: true,
    informacoes_adicionais: true
  },
  texto_recomendacao_padrao: 'Recomendamos o(a) {NOME}, pois demonstrou ser um(a) profissional com experiência considerável nas principais tecnologias solicitadas para a posição supracitada.'
};

// ============================================
// CV GERADO
// ============================================

export interface CVGeradoCompleto {
  id: number;
  candidatura_id: number;
  template_id: number;
  template_tipo: string;
  
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
