/**
 * CVImportIA.tsx - Importação Inteligente de CVs com IA
 * 
 * CORRIGIDO v1.2: Usa API backend /api/gemini-analyze
 * - NÃO usa API key no frontend (segurança)
 * - Chama endpoint Vercel que tem a API_KEY configurada
 * 
 * Versão: 1.2
 * Data: 27/12/2024
 */

import React, { useState, useRef } from 'react';
import { supabase } from '../../config/supabase';
import { 
  Upload, Sparkles, Check, X, AlertCircle, AlertTriangle,
  User, Briefcase, GraduationCap,
  Globe, Code, ChevronDown, ChevronUp, Save, RefreshCw,
  Loader2, Eye
} from 'lucide-react';

// ============================================
// TIPOS
// ============================================

interface CVImportIAProps {
  onImportComplete: (pessoa: DadosExtraidos) => void;
  onClose: () => void;
}

// Mapeamento de nomes de estados para siglas
const ESTADOS_BR: Record<string, string> = {
  'acre': 'AC', 'ac': 'AC',
  'alagoas': 'AL', 'al': 'AL',
  'amapá': 'AP', 'amapa': 'AP', 'ap': 'AP',
  'amazonas': 'AM', 'am': 'AM',
  'bahia': 'BA', 'ba': 'BA',
  'ceará': 'CE', 'ceara': 'CE', 'ce': 'CE',
  'distrito federal': 'DF', 'df': 'DF', 'brasília': 'DF', 'brasilia': 'DF',
  'espírito santo': 'ES', 'espirito santo': 'ES', 'es': 'ES',
  'goiás': 'GO', 'goias': 'GO', 'go': 'GO',
  'maranhão': 'MA', 'maranhao': 'MA', 'ma': 'MA',
  'mato grosso': 'MT', 'mt': 'MT',
  'mato grosso do sul': 'MS', 'ms': 'MS',
  'minas gerais': 'MG', 'mg': 'MG',
  'pará': 'PA', 'para': 'PA', 'pa': 'PA',
  'paraíba': 'PB', 'paraiba': 'PB', 'pb': 'PB',
  'paraná': 'PR', 'parana': 'PR', 'pr': 'PR',
  'pernambuco': 'PE', 'pe': 'PE',
  'piauí': 'PI', 'piaui': 'PI', 'pi': 'PI',
  'rio de janeiro': 'RJ', 'rj': 'RJ',
  'rio grande do norte': 'RN', 'rn': 'RN',
  'rio grande do sul': 'RS', 'rs': 'RS',
  'rondônia': 'RO', 'rondonia': 'RO', 'ro': 'RO',
  'roraima': 'RR', 'rr': 'RR',
  'santa catarina': 'SC', 'sc': 'SC',
  'são paulo': 'SP', 'sao paulo': 'SP', 'sp': 'SP',
  'sergipe': 'SE', 'se': 'SE',
  'tocantins': 'TO', 'to': 'TO'
};

// Função para normalizar estado (converte nome completo para sigla)
const normalizarEstado = (estado: string): string => {
  if (!estado) return '';
  const estadoLower = estado.toLowerCase().trim();
  // Se já é sigla válida (2 caracteres), retorna em maiúsculo
  if (estadoLower.length === 2 && ESTADOS_BR[estadoLower]) {
    return estadoLower.toUpperCase();
  }
  // Busca no mapeamento
  return ESTADOS_BR[estadoLower] || estado.substring(0, 2).toUpperCase();
};

interface DadosExtraidos {
  nome: string;
  email: string;
  telefone: string;
  linkedin_url: string;
  cidade: string;
  estado: string;
  titulo_profissional: string;
  senioridade: string;
  disponibilidade: string;
  modalidade_preferida: string;
  pretensao_salarial: number | null;
  resumo_profissional: string;
  skills: SkillExtraida[];
  experiencias: ExperienciaExtraida[];
  formacao: FormacaoExtraida[];
  certificacoes: CertificacaoExtraida[];
  idiomas: IdiomaExtraido[];
  cv_texto_original: string;
  cv_processado: boolean;
  cv_processado_em: string;
}

interface SkillExtraida {
  nome: string;
  categoria: string;
  nivel: string;
  anos_experiencia: number;
}

interface ExperienciaExtraida {
  empresa: string;
  cargo: string;
  data_inicio: string;
  data_fim: string | null;
  atual: boolean;
  descricao: string;
  tecnologias: string[];
}

interface FormacaoExtraida {
  tipo: string;
  curso: string;
  instituicao: string;
  ano_conclusao: number | null;
  em_andamento: boolean;
}

interface CertificacaoExtraida {
  nome: string;
  emissor: string;
  ano: number | null;
}

interface IdiomaExtraido {
  idioma: string;
  nivel: string;
}

// ============================================
// CONSTANTES
// ============================================

const ETAPAS = [
  { id: 1, nome: 'Upload', icone: Upload },
  { id: 2, nome: 'Processando', icone: Sparkles },
  { id: 3, nome: 'Revisão', icone: Eye },
  { id: 4, nome: 'Concluído', icone: Check }
];

const CATEGORIAS_SKILL: Record<string, { label: string; cor: string }> = {
  frontend: { label: 'Frontend', cor: 'bg-blue-100 text-blue-800' },
  backend: { label: 'Backend', cor: 'bg-green-100 text-green-800' },
  database: { label: 'Banco de Dados', cor: 'bg-purple-100 text-purple-800' },
  devops: { label: 'DevOps', cor: 'bg-orange-100 text-orange-800' },
  mobile: { label: 'Mobile', cor: 'bg-pink-100 text-pink-800' },
  soft_skill: { label: 'Soft Skill', cor: 'bg-yellow-100 text-yellow-800' },
  tool: { label: 'Ferramenta', cor: 'bg-gray-100 text-gray-800' },
  other: { label: 'Outro', cor: 'bg-slate-100 text-slate-800' }
};

const NIVEIS_SKILL: Record<string, { label: string; cor: string }> = {
  basico: { label: 'Básico', cor: 'bg-gray-200' },
  intermediario: { label: 'Intermediário', cor: 'bg-blue-200' },
  avancado: { label: 'Avançado', cor: 'bg-green-200' },
  especialista: { label: 'Especialista', cor: 'bg-purple-200' }
};

// ============================================
// PROMPT GEMINI
// ============================================

const buildPromptExtracaoCV = (textoCV: string): string => {
  return `Você é um especialista em análise de currículos de TI. Analise o CV abaixo e extraia TODAS as informações estruturadas.

CURRÍCULO:
==================
${textoCV}
==================

INSTRUÇÕES:
1. Extraia dados pessoais com cuidado (nome completo, email, telefone, LinkedIn)
2. Identifique o título profissional mais adequado
3. Detecte a senioridade baseada nas experiências (junior, pleno, senior, especialista)
4. Extraia TODAS as skills técnicas mencionadas
5. Liste todas as experiências profissionais
6. Liste toda formação acadêmica e certificações
7. Identifique idiomas e níveis

RESPONDA APENAS EM JSON VÁLIDO (sem markdown, sem backticks):
{
  "dados_pessoais": {
    "nome": "Nome Completo",
    "email": "email@exemplo.com",
    "telefone": "(11) 99999-9999",
    "linkedin_url": "https://linkedin.com/in/perfil",
    "cidade": "São Paulo",
    "estado": "SP"
  },
  "dados_profissionais": {
    "titulo_profissional": "Desenvolvedor Full Stack Senior",
    "senioridade": "senior",
    "resumo_profissional": "Resumo do perfil profissional em 2-3 frases"
  },
  "skills": [
    {
      "nome": "React",
      "categoria": "frontend",
      "nivel": "avancado",
      "anos_experiencia": 4
    }
  ],
  "experiencias": [
    {
      "empresa": "Nome da Empresa",
      "cargo": "Cargo Ocupado",
      "data_inicio": "2020-01",
      "data_fim": null,
      "atual": true,
      "descricao": "Descrição das atividades",
      "tecnologias": ["React", "Node.js"]
    }
  ],
  "formacao": [
    {
      "tipo": "graduacao",
      "curso": "Ciência da Computação",
      "instituicao": "Universidade XYZ",
      "ano_conclusao": 2018,
      "em_andamento": false
    }
  ],
  "idiomas": [
    {
      "idioma": "Inglês",
      "nivel": "avancado"
    }
  ]
}

REGRAS:
- Se não encontrar um dado, use string vazia "" ou null
- Categorias de skill: frontend, backend, database, devops, mobile, soft_skill, tool, other
- Níveis de skill: basico, intermediario, avancado, especialista
- Níveis de idioma: basico, intermediario, avancado, fluente, nativo`;
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const CVImportIA: React.FC<CVImportIAProps> = ({ onImportComplete, onClose }) => {
  const [etapaAtual, setEtapaAtual] = useState<1 | 2 | 3 | 4>(1);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [textoCV, setTextoCV] = useState<string>('');
  const [dadosExtraidos, setDadosExtraidos] = useState<DadosExtraidos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number>(0);
  const [salvando, setSalvando] = useState(false);
  const [secaoExpandida, setSecaoExpandida] = useState<string>('dados');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================
  // HANDLERS
  // ============================================

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extensao = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'txt'].includes(extensao || '')) {
      setErro('Formato não suportado. Use PDF ou TXT.');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setErro('Tamanho do arquivo excede a capacidade de processamento da IA, tente um arquivo menor ou TXT.');
      return;
    }

    setArquivo(file);
    setErro(null);
    setEtapaAtual(2);
    setProgresso(10);

    try {
      let texto = '';
      
      if (extensao === 'txt') {
        texto = await file.text();
      } else {
        texto = await extrairTextoPDF(file);
      }

      // Verificar tamanho do base64 antes de enviar
      if (texto.length > 5 * 1024 * 1024) {
        throw new Error('Tamanho do arquivo excede a capacidade de processamento da IA, tente um arquivo menor ou TXT.');
      }

      setTextoCV(texto);
      setProgresso(40);

      await processarComIA(texto, file);

    } catch (err: any) {
      console.error('Erro no processamento:', err);
      setErro(err.message || 'Erro ao processar arquivo');
      setEtapaAtual(1);
    }
  };

  // Extrair texto do PDF - agora apenas converte para base64
  const extrairTextoPDF = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Retorna apenas o base64, o backend vai extrair o texto
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsDataURL(file);
    });
  };

  // Processar CV usando API backend (Vercel + Gemini)
  const processarComIA = async (textoOuBase64: string, file?: File) => {
    setProgresso(50);

    try {
      console.log('🤖 Enviando CV para processamento via API backend...');
      
      // Determinar se é PDF (base64) ou texto
      const isPDF = file?.type === 'application/pdf';
      
      const response = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extrair_cv',
          payload: isPDF 
            ? { base64PDF: textoOuBase64 }
            : { textoCV: textoOuBase64 }
        })
      });

      if (!response.ok) {
        // Tratar erro 413 especificamente
        if (response.status === 413) {
          throw new Error('Tamanho do arquivo excede a capacidade de processamento da IA, tente um arquivo menor ou TXT.');
        }
        
        // Tentar parsear erro JSON
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Erro na API');
        } catch (parseError) {
          throw new Error('Tamanho do arquivo excede a capacidade de processamento da IA, tente um arquivo menor ou TXT.');
        }
      }

      const result = await response.json();
      setProgresso(80);

      if (!result.success || !result.data) {
        throw new Error('Resposta inválida da API');
      }

      const dados = result.data.dados;
      const textoOriginal = result.data.texto_original || '';

      // Log detalhado para debug
      console.log('📊 Dados recebidos da API:');
      console.log('   - Skills:', dados.skills?.length || 0);
      console.log('   - Experiências:', dados.experiencias?.length || 0);
      console.log('   - Formação:', dados.formacao?.length || 0);
      console.log('   - Certificações:', dados.certificacoes?.length || 0);
      console.log('   - Idiomas:', dados.idiomas?.length || 0);

      const dadosCompletos: DadosExtraidos = {
        nome: dados.dados_pessoais?.nome || '',
        email: dados.dados_pessoais?.email || '',
        telefone: dados.dados_pessoais?.telefone || '',
        linkedin_url: dados.dados_pessoais?.linkedin_url || '',
        cidade: dados.dados_pessoais?.cidade || '',
        estado: normalizarEstado(dados.dados_pessoais?.estado || ''),
        titulo_profissional: dados.dados_profissionais?.titulo_profissional || '',
        senioridade: dados.dados_profissionais?.senioridade || 'pleno',
        disponibilidade: 'imediata',
        modalidade_preferida: 'remoto',
        pretensao_salarial: null,
        resumo_profissional: dados.dados_profissionais?.resumo_profissional || '',
        skills: dados.skills || [],
        experiencias: dados.experiencias || [],
        formacao: dados.formacao || [],
        certificacoes: dados.certificacoes || [],
        idiomas: dados.idiomas || [],
        cv_texto_original: textoOriginal,
        cv_processado: true,
        cv_processado_em: new Date().toISOString()
      };

      console.log('✅ CV processado com sucesso:', dadosCompletos.nome);
      console.log('   Total experiências mapeadas:', dadosCompletos.experiencias.length);
      setDadosExtraidos(dadosCompletos);
      setProgresso(100);
      setEtapaAtual(3);

    } catch (err: any) {
      console.error('Erro ao processar com IA:', err);
      
      // Verificar se é erro de tamanho (413) - mostrar mensagem específica
      const mensagemErro = err.message || 'Erro na IA. Preencha os dados manualmente.';
      
      // Fallback: extração básica
      const textoFallback = typeof textoOuBase64 === 'string' && !textoOuBase64.includes('base64') 
        ? textoOuBase64 
        : '';
      const dadosBasicos = extrairDadosBasicos(textoFallback);
      setDadosExtraidos(dadosBasicos);
      setErro(mensagemErro);
      setProgresso(100);
      setEtapaAtual(3);
    }
  };

  // Extração básica (fallback sem IA)
  const extrairDadosBasicos = (texto: string): DadosExtraidos => {
    const emailMatch = texto.match(/[\w.-]+@[\w.-]+\.\w+/);
    const telefoneMatch = texto.match(/\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/);
    const linkedinMatch = texto.match(/linkedin\.com\/in\/[\w-]+/i);

    const skillsComuns = [
      'React', 'Angular', 'Vue', 'Node.js', 'Python', 'Java', 'C#', '.NET',
      'JavaScript', 'TypeScript', 'PHP', 'Laravel', 'Django', 'Spring',
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'AWS', 'Azure', 'GCP',
      'Docker', 'Kubernetes', 'Git', 'CI/CD', 'Agile', 'Scrum'
    ];

    const textoLower = texto.toLowerCase();
    const skillsEncontradas: SkillExtraida[] = skillsComuns
      .filter(s => textoLower.includes(s.toLowerCase()))
      .map(s => ({
        nome: s,
        categoria: 'other',
        nivel: 'intermediario',
        anos_experiencia: 1
      }));

    return {
      nome: '',
      email: emailMatch?.[0] || '',
      telefone: telefoneMatch?.[0] || '',
      linkedin_url: linkedinMatch?.[0] ? `https://${linkedinMatch[0]}` : '',
      cidade: '',
      estado: '',
      titulo_profissional: '',
      senioridade: 'pleno',
      disponibilidade: 'imediata',
      modalidade_preferida: 'remoto',
      pretensao_salarial: null,
      resumo_profissional: '',
      skills: skillsEncontradas,
      experiencias: [],
      formacao: [],
      certificacoes: [],
      idiomas: [],
      cv_texto_original: texto,
      cv_processado: true,
      cv_processado_em: new Date().toISOString()
    };
  };

  const handleCampoChange = (campo: string, valor: any) => {
    if (!dadosExtraidos) return;
    setDadosExtraidos({ ...dadosExtraidos, [campo]: valor });
  };

  const handleRemoveSkill = (index: number) => {
    if (!dadosExtraidos) return;
    const novasSkills = [...dadosExtraidos.skills];
    novasSkills.splice(index, 1);
    setDadosExtraidos({ ...dadosExtraidos, skills: novasSkills });
  };

  const handleSalvar = async () => {
    if (!dadosExtraidos) return;

    setSalvando(true);
    setErro(null);
    
    let pessoaId: number | null = null; // Declarado fora do try para acesso no catch

    try {
      // ✅ NOVO: Upload do PDF para Supabase Storage
      let cvArquivoUrl: string | null = null;
      
      if (arquivo && arquivo.type === 'application/pdf') {
        const timestamp = Date.now();
        const nomeArquivoLimpo = dadosExtraidos.nome
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]/g, '_')
          .substring(0, 50);
        const nomeArquivo = `cv_${nomeArquivoLimpo}_${timestamp}.pdf`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('cvs')
          .upload(nomeArquivo, arquivo, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.warn('⚠️ Erro ao fazer upload do PDF:', uploadError.message);
          // Continua mesmo se falhar o upload (dados ainda serão salvos)
        } else {
          // Obter URL pública do arquivo
          const { data: urlData } = supabase.storage
            .from('cvs')
            .getPublicUrl(nomeArquivo);
          
          cvArquivoUrl = urlData?.publicUrl || null;
          console.log('✅ PDF salvo no Storage:', cvArquivoUrl);
        }
      }

      // Gerar email placeholder se não tiver (para evitar erro de constraint)
      const emailFinal = dadosExtraidos.email || 
        `${dadosExtraidos.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '.')}@pendente.cadastro`;

      const { data: pessoa, error: erroPessoa } = await supabase
        .from('pessoas')
        .insert({
          nome: dadosExtraidos.nome,
          email: emailFinal,
          telefone: dadosExtraidos.telefone,
          linkedin_url: dadosExtraidos.linkedin_url,
          cidade: dadosExtraidos.cidade,
          estado: normalizarEstado(dadosExtraidos.estado),
          titulo_profissional: dadosExtraidos.titulo_profissional,
          senioridade: dadosExtraidos.senioridade,
          disponibilidade: dadosExtraidos.disponibilidade,
          modalidade_preferida: dadosExtraidos.modalidade_preferida,
          pretensao_salarial: dadosExtraidos.pretensao_salarial,
          resumo_profissional: dadosExtraidos.resumo_profissional,
          cv_texto_original: dadosExtraidos.cv_texto_original,
          cv_arquivo_url: cvArquivoUrl, // ✅ NOVO: URL do PDF no Storage
          cv_processado: true,
          cv_processado_em: new Date().toISOString()
        })
        .select()
        .single();

      if (erroPessoa) throw erroPessoa;

      pessoaId = pessoa.id; // Atribuição aqui

      // Salvar Skills (com tratamento robusto)
      if (dadosExtraidos.skills.length > 0) {
        // Categorias e níveis válidos
        const categoriasValidas = ['frontend', 'backend', 'database', 'devops', 'cloud', 'mobile', 'sap', 'soft_skill', 'tool', 'methodology', 'other'];
        const niveisValidos = ['basico', 'intermediario', 'avancado', 'especialista'];
        
        // Filtrar e normalizar skills
        const skillsNormalizadas = dadosExtraidos.skills
          .filter(s => s.nome && s.nome.trim()) // Remover skills sem nome
          .map(s => ({
            pessoa_id: pessoaId,
            skill_nome: String(s.nome || '').trim().substring(0, 100), // Limitar tamanho
            skill_categoria: categoriasValidas.includes(s.categoria) ? s.categoria : 'other',
            nivel: niveisValidos.includes(s.nivel) ? s.nivel : 'intermediario',
            anos_experiencia: typeof s.anos_experiencia === 'number' ? s.anos_experiencia : 0
          }));
        
        // REMOVER DUPLICATAS (baseado em skill_nome, pois há constraint UNIQUE)
        const skillsUnicas = skillsNormalizadas.filter((skill, index, self) =>
          index === self.findIndex(s => s.skill_nome.toLowerCase() === skill.skill_nome.toLowerCase())
        );
        
        console.log('💾 Salvando skills:', skillsUnicas.length, '(removidas', skillsNormalizadas.length - skillsUnicas.length, 'duplicatas)');
        
        // Tentar inserir em lote
        const { error: errSkills } = await supabase.from('pessoa_skills').insert(skillsUnicas);
        
        if (errSkills) {
          console.error('❌ Erro ao salvar skills em lote:', errSkills);
          console.log('🔄 Tentando inserir skills individualmente...');
          
          // Inserir uma a uma para identificar problemas
          let salvos = 0;
          for (const skill of skillsUnicas.slice(0, 100)) { // Limitar a 100
            const { error: errIndividual } = await supabase.from('pessoa_skills').insert(skill);
            if (!errIndividual) {
              salvos++;
            } else {
              console.warn(`⚠️ Falha ao salvar skill "${skill.skill_nome}":`, errIndividual.message);
            }
          }
          console.log(`✅ Skills salvas individualmente: ${salvos}/${skillsUnicas.length}`);
        } else {
          console.log('✅ Skills salvas com sucesso');
        }
      }

      if (dadosExtraidos.experiencias.length > 0) {
        const experienciasParaSalvar = dadosExtraidos.experiencias.map(e => {
          // Converter data "YYYY-MM" para "YYYY-MM-01" (formato DATE)
          const formatarData = (data: string | null) => {
            if (!data) return null;
            // Se já tem dia, retorna como está
            if (data.match(/^\d{4}-\d{2}-\d{2}$/)) return data;
            // Se é YYYY-MM, adiciona -01
            if (data.match(/^\d{4}-\d{2}$/)) return `${data}-01`;
            return null;
          };
          
          return {
            pessoa_id: pessoaId,
            empresa: e.empresa || '',
            cargo: e.cargo || '',
            data_inicio: formatarData(e.data_inicio),
            data_fim: formatarData(e.data_fim),
            atual: e.atual || false,
            descricao: e.descricao || '',
            tecnologias_usadas: Array.isArray(e.tecnologias) ? e.tecnologias : [] // Nome correto!
          };
        });
        
        console.log('💾 Salvando experiências:', experienciasParaSalvar.length);
        console.log('📋 Primeira experiência:', JSON.stringify(experienciasParaSalvar[0]));
        const { error: errExp } = await supabase.from('pessoa_experiencias').insert(experienciasParaSalvar);
        if (errExp) {
          console.error('❌ Erro ao salvar experiências:', errExp);
        } else {
          console.log('✅ Experiências salvas com sucesso');
        }
      }

      // Combinar formação + certificações (certificações são salvas como formação tipo "certificacao")
      const todasFormacoes = [
        ...(dadosExtraidos.formacao || []),
        ...(dadosExtraidos.certificacoes || []).map(c => ({
          tipo: 'certificacao',
          curso: c.nome,
          instituicao: c.emissor,
          ano_conclusao: c.ano,
          em_andamento: false
        }))
      ];

      if (todasFormacoes.length > 0) {
        const formacaoParaSalvar = todasFormacoes.map(f => ({
          pessoa_id: pessoaId,
          tipo: f.tipo,
          curso: f.curso,
          instituicao: f.instituicao,
          ano_conclusao: f.ano_conclusao,
          em_andamento: f.em_andamento
        }));
        await supabase.from('pessoa_formacao').insert(formacaoParaSalvar);
      }

      if (dadosExtraidos.idiomas.length > 0) {
        const idiomasParaSalvar = dadosExtraidos.idiomas.map(i => ({
          pessoa_id: pessoaId,
          idioma: i.idioma,
          nivel: i.nivel
        }));
        await supabase.from('pessoa_idiomas').insert(idiomasParaSalvar);
      }

      // ✅ Registrar log de processamento bem-sucedido
      await supabase.from('pessoa_cv_log').insert({
        pessoa_id: pessoaId,
        acao: 'importacao_cv_ia',
        status: 'sucesso',
        detalhes: {
          skills_extraidas: dadosExtraidos.skills?.length || 0,
          experiencias_extraidas: dadosExtraidos.experiencias?.length || 0,
          formacao_extraida: (dadosExtraidos.formacao?.length || 0) + (dadosExtraidos.certificacoes?.length || 0),
          idiomas_extraidos: dadosExtraidos.idiomas?.length || 0,
          certificacoes_extraidas: dadosExtraidos.certificacoes?.length || 0
        }
      });

      console.log('✅ Todos os dados salvos com sucesso, incluindo log');
      setEtapaAtual(4);
      onImportComplete(dadosExtraidos);

    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      setErro(err.message || 'Erro ao salvar dados');
      
      // ✅ Registrar log de erro (se pessoaId existir)
      try {
        if (pessoaId) {
          await supabase.from('pessoa_cv_log').insert({
            pessoa_id: pessoaId,
            acao: 'importacao_cv_ia',
            status: 'erro',
            erro_mensagem: err.message || 'Erro desconhecido'
          });
        }
      } catch (logErr) {
        console.error('Erro ao registrar log:', logErr);
      }
    } finally {
      setSalvando(false);
    }
  };

  const handleReprocessar = () => {
    setEtapaAtual(1);
    setArquivo(null);
    setTextoCV('');
    setDadosExtraidos(null);
    setProgresso(0);
    setErro(null);
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Sparkles size={28} />
                Importar CV com IA
              </h2>
              <p className="text-blue-100 mt-1">
                Upload do CV → Extração Inteligente → Revisão → Cadastro
              </p>
            </div>
            <button 
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Indicador de Etapas */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {ETAPAS.map((etapa, index) => {
              const Icone = etapa.icone;
              const isAtiva = etapaAtual >= etapa.id;
              const isConcluida = etapaAtual > etapa.id;

              return (
                <React.Fragment key={etapa.id}>
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    isAtiva ? 'bg-white text-blue-600' : 'bg-white/20 text-white/60'
                  }`}>
                    {isConcluida ? <Check size={18} className="text-green-500" /> : <Icone size={18} />}
                    <span className="font-medium text-sm">{etapa.nome}</span>
                  </div>
                  {index < ETAPAS.length - 1 && (
                    <div className={`w-8 h-0.5 ${isAtiva ? 'bg-white' : 'bg-white/30'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* ETAPA 1: Upload */}
          {etapaAtual === 1 && (
            <div className="text-center py-12">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-xl p-12 hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={64} className="mx-auto text-gray-400 mb-4" />
                <h3 className="text-xl font-bold text-gray-700 mb-2">
                  Arraste o CV aqui ou clique para selecionar
                </h3>
                <p className="text-gray-500 mb-4">
                  Formatos aceitos: PDF, TXT (máx. 10MB)
                </p>
                <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                  Selecionar Arquivo
                </button>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />

              {erro && (
                <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                  <AlertCircle size={20} />
                  {erro}
                </div>
              )}

              {/* Info da API */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="text-green-600">✅ API Gemini via backend (gemini-2.0-flash-exp)</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  O processamento é feito no servidor Vercel para maior segurança.
                </p>
              </div>
            </div>
          )}

          {/* ETAPA 2: Processando */}
          {etapaAtual === 2 && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mb-6"></div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Processando CV com IA...
              </h3>
              <p className="text-gray-500 mb-6">{arquivo?.name}</p>
              <div className="max-w-md mx-auto">
                <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${progresso}%` }}
                  />
                </div>
                <p className="text-sm text-gray-500">{progresso}% completo</p>
              </div>
            </div>
          )}

          {/* ETAPA 3: Revisão */}
          {etapaAtual === 3 && dadosExtraidos && (
            <div className="space-y-6">
              {erro && (
                <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                  <AlertCircle size={20} />
                  {erro}
                </div>
              )}

              {/* Dados Pessoais */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setSecaoExpandida(secaoExpandida === 'dados' ? '' : 'dados')}
                  className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100"
                >
                  <span className="font-bold text-gray-700 flex items-center gap-2">
                    <User size={20} className="text-blue-600" />
                    Dados Pessoais
                  </span>
                  {secaoExpandida === 'dados' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {secaoExpandida === 'dados' && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Nome *</label>
                      <input className="w-full border p-2 rounded mt-1" value={dadosExtraidos.nome} onChange={e => handleCampoChange('nome', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Email *</label>
                      <input type="email" className="w-full border p-2 rounded mt-1" value={dadosExtraidos.email} onChange={e => handleCampoChange('email', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Telefone</label>
                      <input className="w-full border p-2 rounded mt-1" value={dadosExtraidos.telefone} onChange={e => handleCampoChange('telefone', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">LinkedIn</label>
                      <input className="w-full border p-2 rounded mt-1" value={dadosExtraidos.linkedin_url} onChange={e => handleCampoChange('linkedin_url', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Cidade</label>
                      <input className="w-full border p-2 rounded mt-1" value={dadosExtraidos.cidade} onChange={e => handleCampoChange('cidade', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Estado</label>
                      <input className="w-full border p-2 rounded mt-1" maxLength={2} value={dadosExtraidos.estado} onChange={e => handleCampoChange('estado', e.target.value.toUpperCase())} />
                    </div>
                  </div>
                )}
              </div>

              {/* Dados Profissionais */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setSecaoExpandida(secaoExpandida === 'profissional' ? '' : 'profissional')}
                  className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100"
                >
                  <span className="font-bold text-gray-700 flex items-center gap-2">
                    <Briefcase size={20} className="text-green-600" />
                    Dados Profissionais
                  </span>
                  {secaoExpandida === 'profissional' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {secaoExpandida === 'profissional' && (
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Título Profissional</label>
                        <input className="w-full border p-2 rounded mt-1" value={dadosExtraidos.titulo_profissional} onChange={e => handleCampoChange('titulo_profissional', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Senioridade</label>
                        <select className="w-full border p-2 rounded mt-1" value={dadosExtraidos.senioridade} onChange={e => handleCampoChange('senioridade', e.target.value)}>
                          <option value="junior">Junior</option>
                          <option value="pleno">Pleno</option>
                          <option value="senior">Senior</option>
                          <option value="especialista">Especialista</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Disponibilidade</label>
                        <select className="w-full border p-2 rounded mt-1" value={dadosExtraidos.disponibilidade} onChange={e => handleCampoChange('disponibilidade', e.target.value)}>
                          <option value="imediata">Imediata</option>
                          <option value="15_dias">15 dias</option>
                          <option value="30_dias">30 dias</option>
                          <option value="empregado">Empregado</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Modalidade</label>
                        <select className="w-full border p-2 rounded mt-1" value={dadosExtraidos.modalidade_preferida} onChange={e => handleCampoChange('modalidade_preferida', e.target.value)}>
                          <option value="remoto">Remoto</option>
                          <option value="hibrido">Híbrido</option>
                          <option value="presencial">Presencial</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Resumo Profissional</label>
                      <textarea className="w-full border p-2 rounded mt-1 h-24" value={dadosExtraidos.resumo_profissional} onChange={e => handleCampoChange('resumo_profissional', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* Skills */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setSecaoExpandida(secaoExpandida === 'skills' ? '' : 'skills')}
                  className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100"
                >
                  <span className="font-bold text-gray-700 flex items-center gap-2">
                    <Code size={20} className="text-purple-600" />
                    Skills ({dadosExtraidos.skills.length})
                  </span>
                  {secaoExpandida === 'skills' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {secaoExpandida === 'skills' && (
                  <div className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {dadosExtraidos.skills.map((skill, index) => (
                        <div key={index} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${CATEGORIAS_SKILL[skill.categoria]?.cor || 'bg-gray-100 text-gray-700'}`}>
                          <span className="font-medium">{skill.nome}</span>
                          <span className="text-xs opacity-70">({NIVEIS_SKILL[skill.nivel]?.label || skill.nivel})</span>
                          <button onClick={() => handleRemoveSkill(index)} className="hover:text-red-600 ml-1"><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                    {dadosExtraidos.skills.length === 0 && (
                      <p className="text-gray-500 text-center py-4">Nenhuma skill identificada.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Experiências */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setSecaoExpandida(secaoExpandida === 'experiencias' ? '' : 'experiencias')}
                  className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100"
                >
                  <span className="font-bold text-gray-700 flex items-center gap-2">
                    <Briefcase size={20} className="text-orange-600" />
                    Experiências ({dadosExtraidos.experiencias.length})
                  </span>
                  {secaoExpandida === 'experiencias' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {secaoExpandida === 'experiencias' && (
                  <div className="p-4 space-y-3">
                    {dadosExtraidos.experiencias.map((exp, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-bold text-gray-800">{exp.cargo}</h4>
                        <p className="text-gray-600">{exp.empresa}</p>
                        <p className="text-sm text-gray-500">{exp.data_inicio} - {exp.atual ? 'Atual' : exp.data_fim}</p>
                        {exp.tecnologias?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {exp.tecnologias.map((tech, i) => (
                              <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{tech}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {dadosExtraidos.experiencias.length === 0 && (
                      <p className="text-gray-500 text-center py-4">Nenhuma experiência identificada.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Formação */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setSecaoExpandida(secaoExpandida === 'formacao' ? '' : 'formacao')}
                  className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100"
                >
                  <span className="font-bold text-gray-700 flex items-center gap-2">
                    <GraduationCap size={20} className="text-indigo-600" />
                    Formação ({dadosExtraidos.formacao.length})
                  </span>
                  {secaoExpandida === 'formacao' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {secaoExpandida === 'formacao' && (
                  <div className="p-4 space-y-3">
                    {dadosExtraidos.formacao.map((form, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-bold text-gray-800">{form.curso}</h4>
                        <p className="text-gray-600">{form.instituicao}</p>
                        <p className="text-sm text-gray-500">{form.em_andamento ? 'Em andamento' : `Concluído em ${form.ano_conclusao}`}</p>
                      </div>
                    ))}
                    {dadosExtraidos.formacao.length === 0 && (
                      <p className="text-gray-500 text-center py-4">Nenhuma formação identificada.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Idiomas */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setSecaoExpandida(secaoExpandida === 'idiomas' ? '' : 'idiomas')}
                  className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100"
                >
                  <span className="font-bold text-gray-700 flex items-center gap-2">
                    <Globe size={20} className="text-teal-600" />
                    Idiomas ({dadosExtraidos.idiomas.length})
                  </span>
                  {secaoExpandida === 'idiomas' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {secaoExpandida === 'idiomas' && (
                  <div className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {dadosExtraidos.idiomas.map((idioma, index) => (
                        <div key={index} className="px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-sm">
                          <span className="font-medium">{idioma.idioma}</span>
                          <span className="text-xs opacity-70 ml-1">({idioma.nivel})</span>
                        </div>
                      ))}
                    </div>
                    {dadosExtraidos.idiomas.length === 0 && (
                      <p className="text-gray-500 text-center py-4">Nenhum idioma identificado.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ETAPA 4: Concluído */}
          {etapaAtual === 4 && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check size={40} className="text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">CV Importado com Sucesso!</h3>
              <p className="text-gray-600 mb-6">{dadosExtraidos?.nome} foi adicionado ao Banco de Talentos.</p>
              <div className="flex justify-center gap-4">
                <button onClick={handleReprocessar} className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                  <RefreshCw size={18} />
                  Importar Outro CV
                </button>
                <button onClick={onClose} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Concluir
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {etapaAtual === 3 && (
          <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
            <button onClick={handleReprocessar} className="flex items-center gap-2 text-gray-600 hover:text-gray-800">
              <RefreshCw size={18} />
              Reprocessar
            </button>
            <div className="flex gap-3 items-center">
              {/* Alerta se falta email */}
              {dadosExtraidos?.nome && !dadosExtraidos?.email && (
                <span className="text-amber-600 text-sm flex items-center gap-1">
                  <AlertTriangle size={16} />
                  Email não encontrado
                </span>
              )}
              <button onClick={onClose} className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={salvando || !dadosExtraidos?.nome}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                title={!dadosExtraidos?.nome ? 'Nome é obrigatório' : ''}
              >
                {salvando ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                {salvando ? 'Salvando...' : 'Salvar no Banco de Talentos'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CVImportIA;
