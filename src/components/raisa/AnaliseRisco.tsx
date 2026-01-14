/**
 * AnaliseRisco.tsx - RMS RAISA v4.2
 * Componente de Análise de Currículo com IA
 * 
 * HISTÓRICO:
 * - v3.0 (06/01/2026): Upload de PDF/DOC, salvar no banco de talentos
 * - v4.0 (08/01/2026): Análise de Adequação CV vs Vaga com Anthropic Claude
 *   • Seleção opcional de vaga
 *   • Gaps, evidências, perguntas por requisito
 *   • Score detalhado com confiança
 *   • Sugestões de mitigação
 * - v4.1 (08/01/2026): Dropdown de clientes e salvamento condicional
 *   • Dropdown de CLIENTE para filtrar vagas (igual Gestão de Vagas)
 *   • Dropdown de VAGA filtrado pelo cliente selecionado
 *   • Score mínimo 40% para salvamento automático
 *   • Botão de salvamento manual para scores baixos
 *   • Persistência automática seguindo padrão CVImportIA
 * - v4.2 (14/01/2026): Correção de campos e exclusividade
 *   • Adicionado useAuth para acesso ao usuário logado
 *   • Campos de exclusividade: id_analista_rs, periodo_exclusividade (60 dias)
 *   • Campo origem: 'importacao_cv' (antes era NULL)
 *   • Campos adicionais: cpf, disponibilidade, modalidade_preferida, pretensao_salarial
 *   • Log de exclusividade em log_exclusividade
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/config/supabase';
import { useAuth } from '../../contexts/AuthContext'; // 🆕 v4.2: Autenticação para exclusividade
import { 
  Upload, FileText, Brain, Loader2, CheckCircle, XCircle,
  AlertTriangle, Target, RefreshCw, UserPlus, Download,
  TrendingUp, TrendingDown, AlertCircle, ChevronRight,
  File, Trash2, Eye, Save, Database, BarChart3,
  Users, Clock, Award, ThumbsUp, ThumbsDown, Briefcase,
  HelpCircle, MessageSquare, Shield, Zap, ChevronDown,
  Lightbulb
} from 'lucide-react';

// ============================================
// TIPOS
// ============================================

interface AnaliseTriagem {
  sucesso: boolean;
  score_geral: number;
  nivel_risco: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
  fatores_risco: Array<{
    tipo: string;
    nivel: string;
    descricao: string;
    evidencia?: string;
  }>;
  pontos_fortes: string[];
  pontos_fracos: string[];
  skills_detectadas: string[];
  experiencia_anos: number;
  senioridade_estimada: string;
  areas_atuacao: string[];
  recomendacao: 'banco_talentos' | 'analisar_mais' | 'descartar';
  justificativa: string;
}

interface CandidaturaRisco {
  id: number;
  candidatura_id: number;
  candidato_nome: string;
  vaga_titulo: string;
  risco_reprovacao: number;
  nivel_risco: string;
  recomendacao: string;
  criado_em: string;
}

interface MetricasIA {
  total_analises: number;
  com_resultado: number;
  predicoes_corretas: number;
  taxa_acerto: number;
  por_recomendacao: {
    aprovar: { total: number; acertos: number };
    entrevistar: { total: number; acertos: number };
    revisar: { total: number; acertos: number };
    rejeitar: { total: number; acertos: number };
  };
}

// 🆕 v4.1: Interface para clientes
interface ClienteSimples {
  id: number;
  razao_social: string;
}

interface VagaSimples {
  id: number;
  titulo: string;
  cliente_id?: number;
  cliente_nome?: string;
  requisitos_obrigatorios?: string;
  requisitos_desejaveis?: string;
  stack_tecnologica?: string[];
  senioridade?: string;
}

// Tipos para análise de adequação (do hook useAnaliseAdequacao)
interface RequisitoAnalisado {
  requisito: string;
  tipo: 'obrigatorio' | 'desejavel';
  status: 'atendido' | 'parcial' | 'nao_atendido';
  evidencias_encontradas: string[];
  evidencias_ausentes: string[];
  experiencias_relacionadas: string[];
  score: number;
  confianca: number;
}

interface PerguntaEntrevista {
  tema: string;
  pergunta: string;
  objetivo: string;
  o_que_avaliar: string;
  red_flags: string[];
}

interface GapIdentificado {
  requisito: string;
  gap: string;
  impacto: 'alto' | 'medio' | 'baixo';
  sugestao_mitigacao: string;
}

interface AnaliseAdequacaoResultado {
  score_geral: number;
  nivel_confianca: number;
  recomendacao: 'aprovar' | 'entrevistar' | 'revisar' | 'rejeitar';
  justificativa_recomendacao: string;
  requisitos_analisados: RequisitoAnalisado[];
  perguntas_entrevista: PerguntaEntrevista[];
  gaps_identificados: GapIdentificado[];
  pontos_fortes: string[];
  pontos_atencao: string[];
  resumo_executivo: string;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const AnaliseRisco: React.FC = () => {
  // 🆕 v4.2: Autenticação para exclusividade
  const { user } = useAuth();
  
  // Estados gerais
  const [abaAtiva, setAbaAtiva] = useState<'triagem' | 'alertas' | 'metricas'>('triagem');
  
  // Estados da aba Triagem
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [textoExtraido, setTextoExtraido] = useState<string>('');
  const [isExtraindo, setIsExtraindo] = useState(false);
  const [isAnalisando, setIsAnalisando] = useState(false);
  const [analise, setAnalise] = useState<AnaliseTriagem | null>(null);
  const [salvouBanco, setSalvouBanco] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 🆕 v4.0: Estados para análise de adequação
  const [vagas, setVagas] = useState<VagaSimples[]>([]);
  const [vagaSelecionada, setVagaSelecionada] = useState<VagaSimples | null>(null);
  const [loadingVagas, setLoadingVagas] = useState(false);
  const [analiseAdequacao, setAnaliseAdequacao] = useState<AnaliseAdequacaoResultado | null>(null);
  const [isAnalisandoAdequacao, setIsAnalisandoAdequacao] = useState(false);
  const [abaResultado, setAbaResultado] = useState<'resumo' | 'requisitos' | 'gaps' | 'perguntas'>('resumo');
  
  // 🆕 v4.1: Estados para filtro por cliente
  const [clientes, setClientes] = useState<ClienteSimples[]>([]);
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<number | null>(null);
  const [isSalvandoManual, setIsSalvandoManual] = useState(false);
  const [dadosParaSalvarManual, setDadosParaSalvarManual] = useState<any>(null);
  
  // 🆕 v4.1: Score mínimo para salvamento automático (40%)
  const SCORE_MINIMO_SALVAR = 40;
  
  // Estados da aba Alertas
  const [alertas, setAlertas] = useState<CandidaturaRisco[]>([]);
  const [loadingAlertas, setLoadingAlertas] = useState(false);
  
  // Estados da aba Métricas
  const [metricas, setMetricas] = useState<MetricasIA | null>(null);
  const [loadingMetricas, setLoadingMetricas] = useState(false);

  // ============================================
  // CARREGAR DADOS INICIAIS
  // ============================================

  useEffect(() => {
    carregarClientes();
    carregarVagas();
  }, []);

  useEffect(() => {
    if (abaAtiva === 'alertas') {
      carregarAlertas();
    } else if (abaAtiva === 'metricas') {
      carregarMetricas();
    }
  }, [abaAtiva]);

  // 🆕 v4.1: Carregar lista de clientes
  const carregarClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, razao_social_cliente')
        .eq('ativo_cliente', true)
        .order('razao_social_cliente', { ascending: true });

      if (error) throw error;

      const clientesFormatados: ClienteSimples[] = (data || []).map((c: any) => ({
        id: c.id,
        razao_social: c.razao_social_cliente || 'Sem nome'
      }));

      setClientes(clientesFormatados);
      console.log(`✅ ${clientesFormatados.length} clientes carregados`);
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
    }
  };

  // Carregar vagas abertas
  const carregarVagas = async () => {
    setLoadingVagas(true);
    try {
      const { data, error } = await supabase
        .from('vagas')
        .select(`
          id,
          titulo,
          cliente_id,
          requisitos_obrigatorios,
          requisitos_desejaveis,
          stack_tecnologica,
          senioridade,
          clients (
            id,
            razao_social_cliente
          )
        `)
        .eq('status', 'aberta')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const vagasFormatadas: VagaSimples[] = (data || []).map((v: any) => ({
        id: v.id,
        titulo: v.titulo,
        cliente_id: v.cliente_id,
        cliente_nome: v.clients?.razao_social_cliente || 'Sem cliente',
        requisitos_obrigatorios: v.requisitos_obrigatorios,
        requisitos_desejaveis: v.requisitos_desejaveis,
        stack_tecnologica: v.stack_tecnologica,
        senioridade: v.senioridade
      }));

      setVagas(vagasFormatadas);
      console.log(`✅ ${vagasFormatadas.length} vagas carregadas`);
    } catch (err) {
      console.error('Erro ao carregar vagas:', err);
    } finally {
      setLoadingVagas(false);
    }
  };

  // 🆕 v4.1: Filtrar vagas por cliente selecionado
  const vagasFiltradas = clienteSelecionadoId
    ? vagas.filter(v => v.cliente_id === clienteSelecionadoId)
    : vagas;

  // ============================================
  // ABA 1: TRIAGEM DE CVs
  // ============================================

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const tiposPermitidos = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!tiposPermitidos.includes(file.type)) {
      setErro('Formato não suportado. Use PDF, DOC ou DOCX.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErro('Arquivo muito grande. Máximo 10MB.');
      return;
    }

    setArquivo(file);
    setErro(null);
    setAnalise(null);
    setAnaliseAdequacao(null);
    setSalvouBanco(false);
    
    await extrairTexto(file);
  };

  const extrairTexto = async (file: File) => {
    setIsExtraindo(true);
    setErro(null);

    try {
      const base64 = await fileToBase64(file);
      
      const response = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extrair_cv',
          payload: {
            base64PDF: base64,
            textoCV: ''
          }
        })
      });

      const result = await response.json();

      if (result.success && result.data?.texto_original) {
        setTextoExtraido(result.data.texto_original);
      } else if (result.success && result.data?.dados) {
        const dados = result.data.dados;
        const texto = montarTextoDeCV(dados);
        setTextoExtraido(texto);
      } else {
        throw new Error(result.error || 'Falha ao extrair texto do arquivo');
      }
    } catch (err: any) {
      console.error('Erro ao extrair texto:', err);
      setErro(`Erro ao extrair texto: ${err.message}`);
      setTextoExtraido('');
    } finally {
      setIsExtraindo(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const montarTextoDeCV = (dados: any): string => {
    let texto = '';
    if (dados.nome) texto += `Nome: ${dados.nome}\n`;
    if (dados.email) texto += `Email: ${dados.email}\n`;
    if (dados.telefone) texto += `Telefone: ${dados.telefone}\n`;
    if (dados.titulo_profissional) texto += `Cargo: ${dados.titulo_profissional}\n`;
    if (dados.senioridade) texto += `Senioridade: ${dados.senioridade}\n`;
    if (dados.resumo) texto += `\nResumo:\n${dados.resumo}\n`;
    if (dados.experiencias?.length) {
      texto += '\nExperiências:\n';
      dados.experiencias.forEach((exp: any) => {
        texto += `- ${exp.cargo} em ${exp.empresa} (${exp.periodo})\n`;
        if (exp.descricao) texto += `  ${exp.descricao}\n`;
      });
    }
    if (dados.formacoes?.length) {
      texto += '\nFormação:\n';
      dados.formacoes.forEach((f: any) => {
        texto += `- ${f.curso} - ${f.instituicao}\n`;
      });
    }
    if (dados.skills?.length) {
      texto += `\nSkills: ${dados.skills.join(', ')}\n`;
    }
    return texto;
  };

  // Análise genérica (sem vaga) - TAMBÉM salva no banco automaticamente
  const handleAnalisarTriagem = async () => {
    if (!textoExtraido || textoExtraido.length < 50) {
      setErro('Texto do currículo muito curto para análise.');
      return;
    }

    setIsAnalisando(true);
    setErro(null);
    setAnalise(null);
    setAnaliseAdequacao(null);

    try {
      // ========================================
      // PASSO 1: Extrair dados estruturados do CV
      // ========================================
      console.log('🤖 Extraindo dados do CV via Gemini...');
      
      const extractResponse = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extrair_cv',
          payload: {
            textoCV: textoExtraido,
            base64PDF: ''
          }
        })
      });

      let dadosExtraidos = null;
      let textoOriginal = textoExtraido;

      if (extractResponse.ok) {
        const extractResult = await extractResponse.json();
        if (extractResult.success && extractResult.data?.dados) {
          dadosExtraidos = extractResult.data.dados;
          textoOriginal = extractResult.data.texto_original || textoExtraido;
        }
      }

      // ========================================
      // PASSO 2: Triagem genérica
      // ========================================
      console.log('🎯 Realizando triagem genérica...');
      
      const response = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'triagem_cv_generica',
          payload: {
            curriculo_texto: textoExtraido
          }
        })
      });

      const result = await response.json();

      if (result.success && result.data?.sucesso) {
        setAnalise(result.data);
        
        // ========================================
        // PASSO 3: PERSISTIR NO BANCO (SE SCORE >= 40%)
        // 🆕 v4.1: Só salva automaticamente se score for adequado
        // ========================================
        const scoreGeral = result.data.score_geral || 0;
        
        if (dadosExtraidos && scoreGeral >= SCORE_MINIMO_SALVAR) {
          console.log(`💾 Score ${scoreGeral}% >= ${SCORE_MINIMO_SALVAR}% - Salvando candidato...`);
          
          const candidato = {
            nome: dadosExtraidos.dados_pessoais?.nome || 'Candidato',
            email: dadosExtraidos.dados_pessoais?.email || '',
            telefone: dadosExtraidos.dados_pessoais?.telefone || '',
            linkedin_url: dadosExtraidos.dados_pessoais?.linkedin_url || '',
            cidade: dadosExtraidos.dados_pessoais?.cidade || '',
            estado: dadosExtraidos.dados_pessoais?.estado || '',
            titulo_profissional: dadosExtraidos.dados_profissionais?.titulo_profissional || result.data.areas_atuacao?.[0] || '',
            senioridade: dadosExtraidos.dados_profissionais?.senioridade || result.data.senioridade_estimada || 'pleno',
            resumo_profissional: dadosExtraidos.dados_profissionais?.resumo_profissional || result.data.justificativa || '',
            skills: dadosExtraidos.skills || [],
            experiencias: dadosExtraidos.experiencias || [],
            formacao: dadosExtraidos.formacao || [],
            certificacoes: dadosExtraidos.certificacoes || [],
            idiomas: dadosExtraidos.idiomas || [],
            cv_texto_original: textoOriginal
          };

          const pessoaSalva = await salvarCandidatoNoBancoTriagem(candidato, dadosExtraidos, textoOriginal, result.data);
          
          if (pessoaSalva) {
            console.log('✅ Candidato salvo com ID:', pessoaSalva.id);
            setSalvouBanco(true);
          }
        } else if (dadosExtraidos) {
          console.log(`⚠️ Score ${scoreGeral}% < ${SCORE_MINIMO_SALVAR}% - Candidato NÃO salvo automaticamente`);
          // Guardar dados para salvamento manual
          setDadosParaSalvarManual({ candidato: dadosExtraidos, textoOriginal, analiseResult: result.data });
        }
      } else {
        throw new Error(result.data?.erro || result.error || 'Erro na análise');
      }
    } catch (err: any) {
      console.error('Erro na análise:', err);
      setErro(`Erro na análise: ${err.message}`);
    } finally {
      setIsAnalisando(false);
    }
  };

  // Função de persistência para triagem genérica
  const salvarCandidatoNoBancoTriagem = async (candidato: any, dados: any, textoOriginal: string, analiseResult: any) => {
    try {
      const normalizarEstado = (estado: string): string => {
        if (!estado) return '';
        const ESTADOS_BR: Record<string, string> = {
          'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
          'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES', 'goiás': 'GO',
          'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
          'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR', 'pernambuco': 'PE', 'piauí': 'PI',
          'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
          'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'são paulo': 'SP',
          'sergipe': 'SE', 'tocantins': 'TO'
        };
        const estadoLower = estado.toLowerCase().trim();
        if (estadoLower.length === 2) return estadoLower.toUpperCase();
        return ESTADOS_BR[estadoLower] || estado.substring(0, 2).toUpperCase();
      };

      const emailFinal = candidato.email || 
        `${(candidato.nome || 'candidato').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '.')}@pendente.cadastro`;

      // 🆕 v4.2: Calcular datas de exclusividade
      const periodoExclusividade = 60; // Período padrão
      const dataInicio = new Date();
      const dataFinal = user?.id 
        ? new Date(dataInicio.getTime() + periodoExclusividade * 24 * 60 * 60 * 1000)
        : null;

      // 1. Salvar pessoa
      const { data: pessoa, error: erroPessoa } = await supabase
        .from('pessoas')
        .insert({
          nome: candidato.nome || 'Candidato (CV Importado)',
          email: emailFinal,
          cpf: candidato.cpf || null, // 🆕 v4.2
          telefone: candidato.telefone || null,
          linkedin_url: candidato.linkedin_url || null,
          cidade: candidato.cidade || null,
          estado: normalizarEstado(candidato.estado || ''),
          titulo_profissional: candidato.titulo_profissional || null,
          senioridade: candidato.senioridade || 'pleno',
          disponibilidade: candidato.disponibilidade || null, // 🆕 v4.2
          modalidade_preferida: candidato.modalidade_preferida || null, // 🆕 v4.2
          pretensao_salarial: candidato.pretensao_salarial || null, // 🆕 v4.2
          resumo_profissional: candidato.resumo_profissional || null,
          cv_texto_original: textoOriginal?.substring(0, 50000) || null,
          cv_resumo: analiseResult?.justificativa || null,
          cv_processado: true,
          cv_processado_em: new Date().toISOString(),
          cv_processado_por: 'Triagem Genérica - Gemini',
          observacoes: `Importado via Triagem de CVs em ${new Date().toLocaleDateString('pt-BR')}\n\nScore: ${analiseResult?.score_geral || 0}%\nRecomendação IA: ${analiseResult?.recomendacao || 'N/A'}`,
          ativo: true,
          origem: 'importacao_cv', // 🆕 v4.2
          criado_em: new Date().toISOString(),
          // 🆕 v4.2: Campos de Exclusividade
          id_analista_rs: user?.id || null,
          periodo_exclusividade: periodoExclusividade,
          data_inicio_exclusividade: user?.id ? dataInicio.toISOString() : null,
          data_final_exclusividade: dataFinal?.toISOString() || null,
          qtd_renovacoes: 0,
          max_renovacoes: 2
        })
        .select()
        .single();

      if (erroPessoa) {
        console.error('❌ Erro ao salvar pessoa:', erroPessoa);
        return null;
      }

      const pessoaId = pessoa.id;

      // 🆕 v4.2: Registrar no log de exclusividade
      if (user?.id) {
        await supabase.from('log_exclusividade').insert({
          pessoa_id: pessoaId,
          acao: 'atribuicao',
          analista_novo_id: user.id,
          realizado_por: user.id,
          motivo: 'Cadastro via Triagem de CVs',
          data_exclusividade_nova: dataFinal?.toISOString(),
          qtd_renovacoes_nova: 0
        });
        console.log('✅ Exclusividade registrada para analista:', user.nome_usuario);
      }

      // 2. Salvar Skills - combina extraídas + detectadas na triagem
      const skillsCombinadas = [
        ...(candidato.skills || []),
        ...(analiseResult?.skills_detectadas || []).map((s: string) => ({
          nome: s,
          categoria: 'other',
          nivel: 'intermediario',
          anos_experiencia: 0
        }))
      ];

      if (skillsCombinadas.length > 0) {
        const categoriasValidas = ['frontend', 'backend', 'database', 'devops', 'cloud', 'mobile', 'sap', 'soft_skill', 'tool', 'methodology', 'other'];
        const niveisValidos = ['basico', 'intermediario', 'avancado', 'especialista'];
        
        const skillsNormalizadas = skillsCombinadas
          .filter((s: any) => (s.nome || s) && String(s.nome || s).trim())
          .map((s: any) => ({
            pessoa_id: pessoaId,
            skill_nome: String(s.nome || s).trim().substring(0, 100),
            skill_categoria: categoriasValidas.includes(s.categoria) ? s.categoria : 'other',
            nivel: niveisValidos.includes(s.nivel) ? s.nivel : 'intermediario',
            anos_experiencia: typeof s.anos_experiencia === 'number' ? s.anos_experiencia : 0
          }));
        
        const skillsUnicas = skillsNormalizadas.filter((skill: any, index: number, self: any[]) =>
          index === self.findIndex(s => s.skill_nome.toLowerCase() === skill.skill_nome.toLowerCase())
        );
        
        if (skillsUnicas.length > 0) {
          await supabase.from('pessoa_skills').insert(skillsUnicas);
          console.log('✅ Skills salvas:', skillsUnicas.length);
        }
      }

      // 3. Salvar Experiências
      if (candidato.experiencias?.length > 0) {
        const formatarData = (data: string | null) => {
          if (!data) return null;
          if (data.match(/^\d{4}-\d{2}-\d{2}$/)) return data;
          if (data.match(/^\d{4}-\d{2}$/)) return `${data}-01`;
          return null;
        };

        const experienciasParaSalvar = candidato.experiencias.map((e: any) => ({
          pessoa_id: pessoaId,
          empresa: e.empresa || '',
          cargo: e.cargo || '',
          data_inicio: formatarData(e.data_inicio),
          data_fim: formatarData(e.data_fim),
          atual: e.atual || false,
          descricao: e.descricao || '',
          tecnologias_usadas: Array.isArray(e.tecnologias) ? e.tecnologias : []
        }));
        
        await supabase.from('pessoa_experiencias').insert(experienciasParaSalvar);
        console.log('✅ Experiências salvas:', experienciasParaSalvar.length);
      }

      // 4. Salvar Formação
      const todasFormacoes = [
        ...(candidato.formacao || []),
        ...(candidato.certificacoes || []).map((c: any) => ({
          tipo: 'certificacao',
          curso: c.nome,
          instituicao: c.emissor,
          ano_conclusao: c.ano,
          em_andamento: false
        }))
      ];

      if (todasFormacoes.length > 0) {
        const formacaoParaSalvar = todasFormacoes.map((f: any) => ({
          pessoa_id: pessoaId,
          tipo: f.tipo || 'graduacao',
          curso: f.curso || '',
          instituicao: f.instituicao || '',
          ano_conclusao: f.ano_conclusao || null,
          em_andamento: f.em_andamento || false
        }));
        
        await supabase.from('pessoa_formacao').insert(formacaoParaSalvar);
        console.log('✅ Formação salva:', formacaoParaSalvar.length);
      }

      // 5. Salvar Idiomas
      if (candidato.idiomas?.length > 0) {
        const idiomasParaSalvar = candidato.idiomas.map((i: any) => ({
          pessoa_id: pessoaId,
          idioma: i.idioma || '',
          nivel: i.nivel || 'intermediario'
        }));
        
        await supabase.from('pessoa_idiomas').insert(idiomasParaSalvar);
        console.log('✅ Idiomas salvos:', idiomasParaSalvar.length);
      }

      // 6. Log
      await supabase.from('pessoa_cv_log').insert({
        pessoa_id: pessoaId,
        acao: 'triagem_cv_generica',
        status: 'sucesso',
        detalhes: {
          score_triagem: analiseResult?.score_geral,
          recomendacao: analiseResult?.recomendacao,
          skills_extraidas: skillsCombinadas.length,
          experiencias_extraidas: candidato.experiencias?.length || 0
        }
      });

      return pessoa;

    } catch (err: any) {
      console.error('❌ Erro ao salvar no banco:', err);
      return null;
    }
  };

  // 🆕 v4.0: Análise de adequação (CV vs Vaga)
  // Segue o padrão testado do CVImportIA.tsx
  const handleAnalisarAdequacao = async () => {
    if (!textoExtraido || textoExtraido.length < 50) {
      setErro('Texto do currículo muito curto para análise.');
      return;
    }

    if (!vagaSelecionada) {
      setErro('Selecione uma vaga para análise de adequação.');
      return;
    }

    setIsAnalisandoAdequacao(true);
    setErro(null);
    setAnalise(null);
    setAnaliseAdequacao(null);

    try {
      // ========================================
      // PASSO 1: Extrair dados do CV via Gemini
      // (Mesmo padrão do CVImportIA.tsx)
      // ========================================
      console.log('🤖 Extraindo dados do CV via Gemini...');
      
      const extractResponse = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extrair_cv',
          payload: {
            textoCV: textoExtraido,
            base64PDF: ''
          }
        })
      });

      if (!extractResponse.ok) {
        throw new Error('Erro ao extrair dados do CV');
      }

      const extractResult = await extractResponse.json();

      if (!extractResult.success || !extractResult.data) {
        throw new Error('Resposta inválida da API de extração');
      }

      // Estrutura EXATA do CVImportIA.tsx
      const dados = extractResult.data.dados;
      const textoOriginal = extractResult.data.texto_original || textoExtraido;

      console.log('📊 Dados extraídos:');
      console.log('   - Nome:', dados.dados_pessoais?.nome);
      console.log('   - Skills:', dados.skills?.length || 0);
      console.log('   - Experiências:', dados.experiencias?.length || 0);

      // Montar objeto candidato (padrão CVImportIA)
      const candidato = {
        nome: dados.dados_pessoais?.nome || 'Candidato',
        email: dados.dados_pessoais?.email || '',
        telefone: dados.dados_pessoais?.telefone || '',
        linkedin_url: dados.dados_pessoais?.linkedin_url || '',
        cidade: dados.dados_pessoais?.cidade || '',
        estado: dados.dados_pessoais?.estado || '',
        titulo_profissional: dados.dados_profissionais?.titulo_profissional || '',
        senioridade: dados.dados_profissionais?.senioridade || 'pleno',
        resumo_profissional: dados.dados_profissionais?.resumo_profissional || '',
        skills: dados.skills || [],
        experiencias: dados.experiencias || [],
        formacao: dados.formacao || [],
        certificacoes: dados.certificacoes || [],
        idiomas: dados.idiomas || [],
        cv_texto_original: textoOriginal
      };

      // ========================================
      // PASSO 2: Análise de Adequação via Claude
      // (Analisamos PRIMEIRO para saber o score)
      // ========================================
      console.log('🎯 Analisando adequação via Claude...');

      const vaga = {
        titulo: vagaSelecionada.titulo,
        senioridade: vagaSelecionada.senioridade,
        requisitos_obrigatorios: vagaSelecionada.requisitos_obrigatorios,
        requisitos_desejaveis: vagaSelecionada.requisitos_desejaveis,
        stack_tecnologica: vagaSelecionada.stack_tecnologica,
        cliente_nome: vagaSelecionada.cliente_nome
      };

      const response = await fetch('/api/analise-adequacao-perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidato, vaga })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro na análise de adequação');
      }

      const result = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Resposta inválida da API de adequação');
      }

      // ========================================
      // PASSO 3: Mapear resposta para o componente
      // ========================================
      const data = result.data;
      const scoreGeral = data.score_geral || 0;
      console.log('✅ Análise concluída - Score:', scoreGeral);

      const analiseFormatada: AnaliseAdequacaoResultado = {
        score_geral: scoreGeral,
        nivel_confianca: data.confianca_analise || 0,
        recomendacao: mapearRecomendacao(data.avaliacao_final?.recomendacao),
        justificativa_recomendacao: data.avaliacao_final?.justificativa || '',
        requisitos_analisados: [
          ...(data.requisitos_imprescindiveis || []).map((r: any) => formatarRequisito(r, 'obrigatorio')),
          ...(data.requisitos_muito_desejaveis || []).map((r: any) => formatarRequisito(r, 'desejavel')),
          ...(data.requisitos_desejaveis || []).map((r: any) => formatarRequisito(r, 'desejavel'))
        ],
        perguntas_entrevista: formatarPerguntas(data.perguntas_entrevista || []),
        gaps_identificados: formatarGaps(data),
        pontos_fortes: data.resumo_executivo?.principais_pontos_fortes || [],
        pontos_atencao: [
          ...(data.resumo_executivo?.gaps_criticos || []),
          ...(data.avaliacao_final?.pontos_atencao_entrevista || [])
        ],
        resumo_executivo: data.avaliacao_final?.justificativa || ''
      };

      setAnaliseAdequacao(analiseFormatada);
      setAbaResultado('resumo');

      // ========================================
      // PASSO 4: PERSISTIR NO BANCO (SE SCORE >= 40%)
      // 🆕 v4.1: Só salva automaticamente se score for adequado
      // ========================================
      if (scoreGeral >= SCORE_MINIMO_SALVAR) {
        console.log(`💾 Score ${scoreGeral}% >= ${SCORE_MINIMO_SALVAR}% - Salvando candidato...`);
        
        const pessoaSalva = await salvarCandidatoNoBanco(candidato, dados, textoOriginal);
        
        if (pessoaSalva) {
          console.log('✅ Candidato salvo com ID:', pessoaSalva.id);
          setSalvouBanco(true);
        }
      } else {
        console.log(`⚠️ Score ${scoreGeral}% < ${SCORE_MINIMO_SALVAR}% - Candidato NÃO salvo automaticamente`);
        // Guardar dados para salvamento manual opcional
        setDadosParaSalvarManual({ candidato, dados, textoOriginal, analiseResult: data });
      }

    } catch (err: any) {
      console.error('❌ Erro na análise de adequação:', err);
      setErro(`Erro na análise: ${err.message}`);
    } finally {
      setIsAnalisandoAdequacao(false);
    }
  };

  // ========================================
  // FUNÇÃO DE PERSISTÊNCIA NO BANCO
  // Padrão CVImportIA.tsx - salva pessoa + skills + experiências + formação + idiomas
  // ========================================
  const salvarCandidatoNoBanco = async (candidato: any, dados: any, textoOriginal: string) => {
    try {
      // Normalizar estado
      const normalizarEstado = (estado: string): string => {
        if (!estado) return '';
        const ESTADOS_BR: Record<string, string> = {
          'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
          'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES', 'goiás': 'GO',
          'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
          'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR', 'pernambuco': 'PE', 'piauí': 'PI',
          'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
          'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'são paulo': 'SP',
          'sergipe': 'SE', 'tocantins': 'TO'
        };
        const estadoLower = estado.toLowerCase().trim();
        if (estadoLower.length === 2) return estadoLower.toUpperCase();
        return ESTADOS_BR[estadoLower] || estado.substring(0, 2).toUpperCase();
      };

      // Gerar email placeholder se não tiver
      const emailFinal = candidato.email || 
        `${(candidato.nome || 'candidato').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '.')}@pendente.cadastro`;

      // 🆕 v4.2: Calcular datas de exclusividade
      const periodoExclusividadeAdequacao = 60; // Período padrão
      const dataInicioAdequacao = new Date();
      const dataFinalAdequacao = user?.id 
        ? new Date(dataInicioAdequacao.getTime() + periodoExclusividadeAdequacao * 24 * 60 * 60 * 1000)
        : null;

      // 1. Salvar pessoa
      const { data: pessoa, error: erroPessoa } = await supabase
        .from('pessoas')
        .insert({
          nome: candidato.nome || 'Candidato (CV Importado)',
          email: emailFinal,
          cpf: candidato.cpf || null, // 🆕 v4.2
          telefone: candidato.telefone || null,
          linkedin_url: candidato.linkedin_url || null,
          cidade: candidato.cidade || null,
          estado: normalizarEstado(candidato.estado || ''),
          titulo_profissional: candidato.titulo_profissional || null,
          senioridade: candidato.senioridade || 'pleno',
          disponibilidade: candidato.disponibilidade || null, // 🆕 v4.2
          modalidade_preferida: candidato.modalidade_preferida || null, // 🆕 v4.2
          pretensao_salarial: candidato.pretensao_salarial || null, // 🆕 v4.2
          resumo_profissional: candidato.resumo_profissional || null,
          cv_texto_original: textoOriginal?.substring(0, 50000) || null,
          cv_processado: true,
          cv_processado_em: new Date().toISOString(),
          cv_processado_por: 'Análise CV vs Vaga - Claude',
          observacoes: `Importado via Análise de Adequação em ${new Date().toLocaleDateString('pt-BR')}`,
          ativo: true,
          origem: 'importacao_cv', // 🆕 v4.2
          criado_em: new Date().toISOString(),
          // 🆕 v4.2: Campos de Exclusividade
          id_analista_rs: user?.id || null,
          periodo_exclusividade: periodoExclusividadeAdequacao,
          data_inicio_exclusividade: user?.id ? dataInicioAdequacao.toISOString() : null,
          data_final_exclusividade: dataFinalAdequacao?.toISOString() || null,
          qtd_renovacoes: 0,
          max_renovacoes: 2
        })
        .select()
        .single();

      if (erroPessoa) {
        console.error('❌ Erro ao salvar pessoa:', erroPessoa);
        // Continua mesmo com erro (dados podem já existir)
        return null;
      }

      const pessoaId = pessoa.id;

      // 🆕 v4.2: Registrar no log de exclusividade
      if (user?.id) {
        await supabase.from('log_exclusividade').insert({
          pessoa_id: pessoaId,
          acao: 'atribuicao',
          analista_novo_id: user.id,
          realizado_por: user.id,
          motivo: 'Cadastro via Análise de Adequação CV vs Vaga',
          data_exclusividade_nova: dataFinalAdequacao?.toISOString(),
          qtd_renovacoes_nova: 0
        });
        console.log('✅ Exclusividade registrada para analista:', user.nome_usuario);
      }

      // 2. Salvar Skills (padrão CVImportIA)
      if (candidato.skills?.length > 0) {
        const categoriasValidas = ['frontend', 'backend', 'database', 'devops', 'cloud', 'mobile', 'sap', 'soft_skill', 'tool', 'methodology', 'other'];
        const niveisValidos = ['basico', 'intermediario', 'avancado', 'especialista'];
        
        const skillsNormalizadas = candidato.skills
          .filter((s: any) => s.nome && s.nome.trim())
          .map((s: any) => ({
            pessoa_id: pessoaId,
            skill_nome: String(s.nome || '').trim().substring(0, 100),
            skill_categoria: categoriasValidas.includes(s.categoria) ? s.categoria : 'other',
            nivel: niveisValidos.includes(s.nivel) ? s.nivel : 'intermediario',
            anos_experiencia: typeof s.anos_experiencia === 'number' ? s.anos_experiencia : 0
          }));
        
        // Remover duplicatas
        const skillsUnicas = skillsNormalizadas.filter((skill: any, index: number, self: any[]) =>
          index === self.findIndex(s => s.skill_nome.toLowerCase() === skill.skill_nome.toLowerCase())
        );
        
        if (skillsUnicas.length > 0) {
          const { error: errSkills } = await supabase.from('pessoa_skills').insert(skillsUnicas);
          if (errSkills) {
            console.warn('⚠️ Erro ao salvar skills:', errSkills.message);
          } else {
            console.log('✅ Skills salvas:', skillsUnicas.length);
          }
        }
      }

      // 3. Salvar Experiências
      if (candidato.experiencias?.length > 0) {
        const formatarData = (data: string | null) => {
          if (!data) return null;
          if (data.match(/^\d{4}-\d{2}-\d{2}$/)) return data;
          if (data.match(/^\d{4}-\d{2}$/)) return `${data}-01`;
          return null;
        };

        const experienciasParaSalvar = candidato.experiencias.map((e: any) => ({
          pessoa_id: pessoaId,
          empresa: e.empresa || '',
          cargo: e.cargo || '',
          data_inicio: formatarData(e.data_inicio),
          data_fim: formatarData(e.data_fim),
          atual: e.atual || false,
          descricao: e.descricao || '',
          tecnologias_usadas: Array.isArray(e.tecnologias) ? e.tecnologias : []
        }));
        
        const { error: errExp } = await supabase.from('pessoa_experiencias').insert(experienciasParaSalvar);
        if (errExp) {
          console.warn('⚠️ Erro ao salvar experiências:', errExp.message);
        } else {
          console.log('✅ Experiências salvas:', experienciasParaSalvar.length);
        }
      }

      // 4. Salvar Formação + Certificações
      const todasFormacoes = [
        ...(candidato.formacao || []),
        ...(candidato.certificacoes || []).map((c: any) => ({
          tipo: 'certificacao',
          curso: c.nome,
          instituicao: c.emissor,
          ano_conclusao: c.ano,
          em_andamento: false
        }))
      ];

      if (todasFormacoes.length > 0) {
        const formacaoParaSalvar = todasFormacoes.map((f: any) => ({
          pessoa_id: pessoaId,
          tipo: f.tipo || 'graduacao',
          curso: f.curso || '',
          instituicao: f.instituicao || '',
          ano_conclusao: f.ano_conclusao || null,
          em_andamento: f.em_andamento || false
        }));
        
        const { error: errForm } = await supabase.from('pessoa_formacao').insert(formacaoParaSalvar);
        if (errForm) {
          console.warn('⚠️ Erro ao salvar formação:', errForm.message);
        } else {
          console.log('✅ Formação salva:', formacaoParaSalvar.length);
        }
      }

      // 5. Salvar Idiomas
      if (candidato.idiomas?.length > 0) {
        const idiomasParaSalvar = candidato.idiomas.map((i: any) => ({
          pessoa_id: pessoaId,
          idioma: i.idioma || '',
          nivel: i.nivel || 'intermediario'
        }));
        
        const { error: errIdiomas } = await supabase.from('pessoa_idiomas').insert(idiomasParaSalvar);
        if (errIdiomas) {
          console.warn('⚠️ Erro ao salvar idiomas:', errIdiomas.message);
        } else {
          console.log('✅ Idiomas salvos:', idiomasParaSalvar.length);
        }
      }

      // 6. Registrar log
      await supabase.from('pessoa_cv_log').insert({
        pessoa_id: pessoaId,
        acao: 'analise_adequacao_cv',
        status: 'sucesso',
        detalhes: {
          vaga_analisada: vagaSelecionada?.titulo,
          skills_extraidas: candidato.skills?.length || 0,
          experiencias_extraidas: candidato.experiencias?.length || 0,
          formacao_extraida: todasFormacoes.length,
          idiomas_extraidos: candidato.idiomas?.length || 0
        }
      });

      return pessoa;

    } catch (err: any) {
      console.error('❌ Erro ao salvar no banco:', err);
      return null;
    }
  };

  // ========================================
  // HELPERS - Formatação de resposta da API
  // ========================================

  const mapearRecomendacao = (rec: string): 'aprovar' | 'entrevistar' | 'revisar' | 'rejeitar' => {
    const mapa: Record<string, 'aprovar' | 'entrevistar' | 'revisar' | 'rejeitar'> = {
      'APROVAR': 'aprovar',
      'ENTREVISTAR': 'entrevistar',
      'REAVALIAR': 'revisar',
      'REPROVAR': 'rejeitar'
    };
    return mapa[rec] || 'revisar';
  };

  const formatarRequisito = (req: any, tipo: 'obrigatorio' | 'desejavel'): RequisitoAnalisado => {
    const statusMap: Record<string, 'atendido' | 'parcial' | 'nao_atendido'> = {
      'ATENDE': 'atendido',
      'ATENDE_PARCIALMENTE': 'parcial',
      'GAP_IDENTIFICADO': 'nao_atendido',
      'NAO_AVALIAVEL': 'parcial'
    };
    
    return {
      requisito: req.requisito || '',
      tipo,
      status: statusMap[req.nivel_adequacao] || 'parcial',
      evidencias_encontradas: req.analise_candidato?.evidencias_encontradas || [],
      evidencias_ausentes: req.analise_candidato?.evidencias_ausentes || [],
      experiencias_relacionadas: req.analise_candidato?.experiencias_relacionadas || [],
      score: req.score_adequacao || 0,
      confianca: 80
    };
  };

  const formatarPerguntas = (categorias: any[]): PerguntaEntrevista[] => {
    const perguntas: PerguntaEntrevista[] = [];
    (categorias || []).forEach((cat: any) => {
      (cat.perguntas || []).forEach((p: any) => {
        perguntas.push({
          tema: cat.categoria || 'Geral',
          pergunta: p.pergunta || '',
          objetivo: p.objetivo || '',
          o_que_avaliar: Array.isArray(p.o_que_avaliar) ? p.o_que_avaliar.join(', ') : (p.o_que_avaliar || ''),
          red_flags: p.red_flags || []
        });
      });
    });
    return perguntas;
  };

  const formatarGaps = (data: any): GapIdentificado[] => {
    const gaps: GapIdentificado[] = [];
    
    const todosRequisitos = [
      ...(data.requisitos_imprescindiveis || []),
      ...(data.requisitos_muito_desejaveis || []),
      ...(data.requisitos_desejaveis || [])
    ];

    todosRequisitos
      .filter((r: any) => r.nivel_adequacao === 'GAP_IDENTIFICADO' || r.nivel_adequacao === 'ATENDE_PARCIALMENTE')
      .forEach((r: any) => {
        gaps.push({
          requisito: r.requisito || '',
          gap: r.justificativa || 'Gap identificado',
          impacto: r.obrigatoriedade === 'IMPRESCINDIVEL' ? 'alto' : 'medio',
          sugestao_mitigacao: r.como_mitigar || 'Investigar na entrevista'
        });
      });

    return gaps;
  };

  const handleLimpar = () => {
    setArquivo(null);
    setTextoExtraido('');
    setAnalise(null);
    setAnaliseAdequacao(null);
    setSalvouBanco(false);
    setErro(null);
    setVagaSelecionada(null);
    setClienteSelecionadoId(null);
    setDadosParaSalvarManual(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 🆕 v4.1: Salvamento manual para candidatos com score baixo
  const handleSalvarManual = async () => {
    if (!dadosParaSalvarManual) return;
    
    setIsSalvandoManual(true);
    
    try {
      const { candidato, dados, textoOriginal, analiseResult } = dadosParaSalvarManual;
      
      // Usar a função apropriada baseado no tipo de análise
      let pessoaSalva = null;
      
      if (analiseAdequacao) {
        // Análise de adequação
        pessoaSalva = await salvarCandidatoNoBanco(candidato, dados, textoOriginal);
      } else if (analise) {
        // Triagem genérica
        pessoaSalva = await salvarCandidatoNoBancoTriagem(candidato, dados, textoOriginal, analiseResult);
      }
      
      if (pessoaSalva) {
        console.log('✅ Candidato salvo manualmente com ID:', pessoaSalva.id);
        setSalvouBanco(true);
        setDadosParaSalvarManual(null);
      }
    } catch (err: any) {
      console.error('❌ Erro ao salvar manualmente:', err);
      setErro(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsSalvandoManual(false);
    }
  };

  // ============================================
  // ABA 2: ALERTAS DE RISCO
  // ============================================

  const carregarAlertas = async () => {
    setLoadingAlertas(true);

    try {
      const { data, error } = await supabase
        .from('ia_recomendacoes_candidato')
        .select(`
          id,
          candidatura_id,
          risco_reprovacao,
          recomendacao,
          analise_detalhada,
          criado_em,
          candidaturas!inner(
            id,
            candidato_nome,
            status,
            vagas!inner(titulo)
          )
        `)
        .eq('tipo_recomendacao', 'analise_cv')
        .gte('risco_reprovacao', 50)
        .in('candidaturas.status', ['triagem', 'entrevista', 'enviado_cliente', 'aguardando_cliente'])
        .order('risco_reprovacao', { ascending: false })
        .limit(20);

      if (error) throw error;

      const alertasFormatados: CandidaturaRisco[] = (data || []).map((item: any) => ({
        id: item.id,
        candidatura_id: item.candidatura_id,
        candidato_nome: item.candidaturas?.candidato_nome || 'N/A',
        vaga_titulo: item.candidaturas?.vagas?.titulo || 'N/A',
        risco_reprovacao: item.risco_reprovacao || 0,
        nivel_risco: item.analise_detalhada?.nivel_risco || 'Médio',
        recomendacao: item.recomendacao || 'revisar',
        criado_em: item.criado_em
      }));

      setAlertas(alertasFormatados);
    } catch (err: any) {
      console.error('Erro ao carregar alertas:', err);
      setAlertas([]);
    } finally {
      setLoadingAlertas(false);
    }
  };

  // ============================================
  // ABA 3: MÉTRICAS DE ACURÁCIA
  // ============================================

  const carregarMetricas = async () => {
    setLoadingMetricas(true);

    try {
      const { data, error } = await supabase
        .from('ia_recomendacoes_candidato')
        .select(`
          id,
          recomendacao,
          resultado_real,
          predicao_correta
        `)
        .eq('tipo_recomendacao', 'analise_cv')
        .not('resultado_real', 'is', null);

      if (error) throw error;

      const total = data?.length || 0;
      const corretas = data?.filter(d => d.predicao_correta === true).length || 0;

      const porRecomendacao = {
        aprovar: { total: 0, acertos: 0 },
        entrevistar: { total: 0, acertos: 0 },
        revisar: { total: 0, acertos: 0 },
        rejeitar: { total: 0, acertos: 0 }
      };

      data?.forEach(item => {
        const rec = item.recomendacao as keyof typeof porRecomendacao;
        if (porRecomendacao[rec]) {
          porRecomendacao[rec].total++;
          if (item.predicao_correta) {
            porRecomendacao[rec].acertos++;
          }
        }
      });

      const { count: totalAnalises } = await supabase
        .from('ia_recomendacoes_candidato')
        .select('id', { count: 'exact', head: true })
        .eq('tipo_recomendacao', 'analise_cv');

      setMetricas({
        total_analises: totalAnalises || 0,
        com_resultado: total,
        predicoes_corretas: corretas,
        taxa_acerto: total > 0 ? (corretas / total) * 100 : 0,
        por_recomendacao: porRecomendacao
      });
    } catch (err: any) {
      console.error('Erro ao carregar métricas:', err);
      setMetricas(null);
    } finally {
      setLoadingMetricas(false);
    }
  };

  // ============================================
  // HELPERS DE RENDER
  // ============================================

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'atendido': return 'bg-green-100 text-green-700 border-green-300';
      case 'parcial': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'nao_atendido': return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'atendido': return '✅ Atendido';
      case 'parcial': return '⚠️ Parcial';
      case 'nao_atendido': return '❌ Não Atendido';
      default: return status;
    }
  };

  const getImpactoColor = (impacto: string) => {
    switch (impacto) {
      case 'alto': return 'bg-red-100 text-red-700';
      case 'medio': return 'bg-yellow-100 text-yellow-700';
      case 'baixo': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getRecomendacaoStyle = (rec: string) => {
    switch (rec) {
      case 'aprovar': return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: '✅', label: 'Aprovar' };
      case 'entrevistar': return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: '🎯', label: 'Entrevistar' };
      case 'revisar': return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: '⚠️', label: 'Revisar' };
      case 'rejeitar': return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: '❌', label: 'Rejeitar' };
      default: return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', icon: '❓', label: rec };
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 space-y-6">
      {/* Título */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Brain className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Análise de Currículo (AI)</h1>
          <p className="text-sm text-gray-500">Triagem inteligente com Gemini 2.0 + Análise de Adequação com Claude</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setAbaAtiva('triagem')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            abaAtiva === 'triagem' 
              ? 'border-purple-600 text-purple-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Upload className="w-4 h-4" />
          Triagem de CVs
        </button>
        <button
          onClick={() => setAbaAtiva('alertas')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            abaAtiva === 'alertas' 
              ? 'border-orange-600 text-orange-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Candidaturas em Risco
          {alertas.length > 0 && (
            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
              {alertas.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setAbaAtiva('metricas')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            abaAtiva === 'metricas' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Métricas de Acurácia
        </button>
      </div>

      {/* ===================== ABA TRIAGEM ===================== */}
      {abaAtiva === 'triagem' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lado Esquerdo: Upload e Configurações */}
          <div className="space-y-4">
            {/* Card de Upload */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-600" />
                Upload de Currículo
              </h2>

              {/* Área de Drop */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  arquivo 
                    ? 'border-green-300 bg-green-50' 
                    : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {arquivo ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="w-10 h-10 text-green-600" />
                    <div className="text-left">
                      <p className="font-medium text-gray-800">{arquivo.name}</p>
                      <p className="text-sm text-gray-500">
                        {(arquivo.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleLimpar(); }}
                      className="p-2 hover:bg-red-100 rounded-lg transition"
                    >
                      <Trash2 className="w-5 h-5 text-red-500" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">
                      Clique ou arraste um arquivo
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      PDF, DOC ou DOCX (máx. 10MB)
                    </p>
                  </>
                )}
              </div>

              {isExtraindo && (
                <div className="mt-4 flex items-center gap-2 text-purple-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Extraindo texto do arquivo...</span>
                </div>
              )}

              {erro && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{erro}</p>
                </div>
              )}
            </div>

            {/* 🆕 v4.1: Seleção de Vaga com filtro por Cliente */}
            {textoExtraido && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  Comparar com Vaga (opcional)
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Selecione uma vaga para análise de adequação detalhada com gaps e perguntas
                </p>
                
                {/* Grid de dois dropdowns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Dropdown 1: Filtro por Cliente */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">
                      Filtrar por Cliente
                    </label>
                    <select
                      value={clienteSelecionadoId || ''}
                      onChange={(e) => {
                        const novoClienteId = e.target.value ? Number(e.target.value) : null;
                        setClienteSelecionadoId(novoClienteId);
                        setVagaSelecionada(null); // Limpar vaga ao mudar cliente
                      }}
                      className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Todos os Clientes</option>
                      {clientes.map((cliente) => (
                        <option key={cliente.id} value={cliente.id}>
                          {cliente.razao_social}
                        </option>
                      ))}
                    </select>
                    {clientes.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">Carregando clientes...</p>
                    )}
                  </div>

                  {/* Dropdown 2: Vagas (filtradas pelo cliente) */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">
                      Selecionar Vaga
                    </label>
                    <select
                      value={vagaSelecionada?.id || ''}
                      onChange={(e) => {
                        const vaga = vagas.find(v => v.id === Number(e.target.value));
                        setVagaSelecionada(vaga || null);
                      }}
                      className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">-- Triagem genérica (sem vaga) --</option>
                      {vagasFiltradas.map((vaga) => (
                        <option key={vaga.id} value={vaga.id}>
                          {!clienteSelecionadoId && vaga.cliente_nome ? `[${vaga.cliente_nome}] ` : ''}{vaga.titulo}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {vagasFiltradas.length} vaga{vagasFiltradas.length !== 1 ? 's' : ''} 
                      {clienteSelecionadoId ? ' neste cliente' : ' abertas'}
                    </p>
                  </div>
                </div>

                {vagaSelecionada && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 text-blue-700 mb-2">
                      <Zap className="w-4 h-4" />
                      <span className="font-medium">Análise Avançada Habilitada</span>
                    </div>
                    <p className="text-xs text-blue-600">
                      Vaga selecionada: <strong>{vagaSelecionada.titulo}</strong>
                      {vagaSelecionada.cliente_nome && ` (${vagaSelecionada.cliente_nome})`}
                    </p>
                    <p className="text-xs text-blue-500 mt-1">
                      A análise incluirá: gaps por requisito, evidências encontradas, perguntas para entrevista e sugestões de mitigação
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Texto Extraído + Botões de Análise */}
            {textoExtraido && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-gray-500" />
                    Texto Extraído
                  </h3>
                  <span className="text-xs text-gray-400">
                    {textoExtraido.length} caracteres
                  </span>
                </div>
                <textarea
                  value={textoExtraido}
                  onChange={(e) => setTextoExtraido(e.target.value)}
                  className="w-full h-40 p-3 border rounded-lg text-sm font-mono bg-gray-50 resize-none"
                  placeholder="O texto extraído aparecerá aqui..."
                />

                {/* Botões de Análise */}
                <div className="mt-4 space-y-2">
                  {vagaSelecionada ? (
                    <button
                      onClick={handleAnalisarAdequacao}
                      disabled={isAnalisandoAdequacao || textoExtraido.length < 50}
                      className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isAnalisandoAdequacao ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Analisando Adequação com Claude...
                        </>
                      ) : (
                        <>
                          <Target className="w-5 h-5" />
                          Analisar Adequação à Vaga
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleAnalisarTriagem}
                      disabled={isAnalisando || textoExtraido.length < 50}
                      className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isAnalisando ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Analisando com Gemini...
                        </>
                      ) : (
                        <>
                          <Brain className="w-5 h-5" />
                          Triagem Genérica
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Lado Direito: Resultados */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              Resultado da Análise
            </h2>

            {/* Estado vazio */}
            {!analise && !analiseAdequacao && !isAnalisando && !isAnalisandoAdequacao && (
              <div className="text-center py-16 text-gray-400">
                <Brain className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Faça upload de um CV e clique em "Analisar"</p>
                <p className="text-sm mt-1">Os resultados aparecerão aqui</p>
              </div>
            )}

            {/* Loading */}
            {(isAnalisando || isAnalisandoAdequacao) && (
              <div className="text-center py-16">
                <Loader2 className="w-12 h-12 mx-auto mb-4 text-purple-600 animate-spin" />
                <p className="text-gray-600">
                  {isAnalisandoAdequacao ? 'Analisando adequação com Claude...' : 'Analisando currículo com Gemini...'}
                </p>
                <p className="text-sm text-gray-400 mt-1">Isso pode levar alguns segundos</p>
              </div>
            )}

            {/* ============ RESULTADO TRIAGEM GENÉRICA ============ */}
            {analise && !analiseAdequacao && (
              <div className="space-y-4">
                {/* Score e Recomendação */}
                <div className={`p-4 rounded-xl ${
                  analise.recomendacao === 'banco_talentos' ? 'bg-green-50 border border-green-200' :
                  analise.recomendacao === 'analisar_mais' ? 'bg-yellow-50 border border-yellow-200' :
                  'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Score Geral</p>
                      <p className={`text-3xl font-bold ${
                        analise.score_geral >= 70 ? 'text-green-600' :
                        analise.score_geral >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {analise.score_geral}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium px-3 py-1 rounded-full ${
                        analise.recomendacao === 'banco_talentos' ? 'bg-green-200 text-green-800' :
                        analise.recomendacao === 'analisar_mais' ? 'bg-yellow-200 text-yellow-800' :
                        'bg-red-200 text-red-800'
                      }`}>
                        {analise.recomendacao === 'banco_talentos' ? '✅ Salvar no Banco' :
                         analise.recomendacao === 'analisar_mais' ? '⚠️ Analisar Mais' :
                         '❌ Descartar'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Risco: {analise.nivel_risco}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mt-3">{analise.justificativa}</p>
                </div>

                {/* Informações Detectadas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-500">Senioridade Estimada</p>
                    <p className="font-medium">{analise.senioridade_estimada || 'N/A'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-500">Experiência</p>
                    <p className="font-medium">{analise.experiencia_anos || 0} anos</p>
                  </div>
                </div>

                {/* Áreas de Atuação */}
                {analise.areas_atuacao?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Áreas de Atuação</p>
                    <div className="flex flex-wrap gap-1">
                      {analise.areas_atuacao.map((area, i) => (
                        <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills */}
                {analise.skills_detectadas?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Skills Detectadas</p>
                    <div className="flex flex-wrap gap-1">
                      {analise.skills_detectadas.slice(0, 15).map((skill, i) => (
                        <span key={i} className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                          {skill}
                        </span>
                      ))}
                      {analise.skills_detectadas.length > 15 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">
                          +{analise.skills_detectadas.length - 15}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Pontos Fortes */}
                {analise.pontos_fortes?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" />
                      Pontos Fortes
                    </p>
                    <ul className="space-y-1">
                      {analise.pontos_fortes.map((ponto, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          {ponto}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Fatores de Risco */}
                {analise.fatores_risco?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-orange-700 mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      Fatores de Risco ({analise.fatores_risco.length})
                    </p>
                    <div className="space-y-2">
                      {analise.fatores_risco.map((risco, i) => (
                        <div key={i} className="p-2 bg-orange-50 rounded-lg border border-orange-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-800">{risco.tipo}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              risco.nivel === 'high' ? 'bg-red-200 text-red-700' :
                              risco.nivel === 'medium' ? 'bg-yellow-200 text-yellow-700' :
                              'bg-blue-200 text-blue-700'
                            }`}>
                              {risco.nivel}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">{risco.descricao}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Indicador de Salvamento */}
                {salvouBanco && (
                  <div className="p-4 bg-green-100 border border-green-300 rounded-lg flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-green-800">✅ Salvo automaticamente no Banco de Talentos</p>
                      <p className="text-sm text-green-600">O candidato foi adicionado à base de pessoas</p>
                    </div>
                  </div>
                )}

                {/* 🆕 v4.1: Opção de salvamento manual para score baixo */}
                {!salvouBanco && dadosParaSalvarManual && analise && (
                  <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-yellow-800">
                          ⚠️ Score abaixo de {SCORE_MINIMO_SALVAR}% - Não salvo automaticamente
                        </p>
                        <p className="text-sm text-yellow-700 mt-1">
                          Este candidato não atingiu o score mínimo para salvamento automático. 
                          Você pode salvá-lo manualmente se desejar.
                        </p>
                        <button
                          onClick={handleSalvarManual}
                          disabled={isSalvandoManual}
                          className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          {isSalvandoManual ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Salvando...
                            </>
                          ) : (
                            <>
                              <Database className="w-4 h-4" />
                              Salvar mesmo assim
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============ 🆕 RESULTADO ANÁLISE DE ADEQUAÇÃO ============ */}
            {analiseAdequacao && (
              <div className="space-y-4">
                {/* Header com Score e Recomendação */}
                <div className={`p-4 rounded-xl border ${getRecomendacaoStyle(analiseAdequacao.recomendacao).bg} ${getRecomendacaoStyle(analiseAdequacao.recomendacao).border}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Score de Adequação</p>
                      <p className={`text-4xl font-bold ${
                        analiseAdequacao.score_geral >= 70 ? 'text-green-600' :
                        analiseAdequacao.score_geral >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {analiseAdequacao.score_geral}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Confiança: {analiseAdequacao.nivel_confianca}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-medium px-4 py-2 rounded-full ${getRecomendacaoStyle(analiseAdequacao.recomendacao).bg} ${getRecomendacaoStyle(analiseAdequacao.recomendacao).text}`}>
                        {getRecomendacaoStyle(analiseAdequacao.recomendacao).icon} {getRecomendacaoStyle(analiseAdequacao.recomendacao).label}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mt-3">{analiseAdequacao.justificativa_recomendacao}</p>
                </div>

                {/* Sub-abas de resultado */}
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                  {[
                    { key: 'resumo', label: 'Resumo', icon: FileText },
                    { key: 'requisitos', label: 'Requisitos', icon: CheckCircle },
                    { key: 'gaps', label: 'Gaps', icon: AlertTriangle },
                    { key: 'perguntas', label: 'Perguntas', icon: HelpCircle }
                  ].map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setAbaResultado(key as any)}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded-md flex items-center justify-center gap-1 transition ${
                        abaResultado === key
                          ? 'bg-white text-purple-700 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Conteúdo das sub-abas */}
                <div className="mt-4">
                  {/* Resumo */}
                  {abaResultado === 'resumo' && (
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium text-gray-800 mb-2">📋 Resumo Executivo</h4>
                        <p className="text-sm text-gray-700">{analiseAdequacao.resumo_executivo}</p>
                      </div>

                      {analiseAdequacao.pontos_fortes?.length > 0 && (
                        <div>
                          <h4 className="font-medium text-green-700 mb-2 flex items-center gap-1">
                            <TrendingUp className="w-4 h-4" /> Pontos Fortes
                          </h4>
                          <ul className="space-y-1">
                            {analiseAdequacao.pontos_fortes.map((p, i) => (
                              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {analiseAdequacao.pontos_atencao?.length > 0 && (
                        <div>
                          <h4 className="font-medium text-orange-700 mb-2 flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" /> Pontos de Atenção
                          </h4>
                          <ul className="space-y-1">
                            {analiseAdequacao.pontos_atencao.map((p, i) => (
                              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Requisitos */}
                  {abaResultado === 'requisitos' && (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {analiseAdequacao.requisitos_analisados?.map((req, i) => (
                        <div key={i} className={`p-3 rounded-lg border ${getStatusColor(req.status)}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <span className={`text-xs px-2 py-0.5 rounded ${req.tipo === 'obrigatorio' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                {req.tipo === 'obrigatorio' ? '⚠️ Obrigatório' : '💡 Desejável'}
                              </span>
                              <p className="font-medium text-gray-800 mt-1">{req.requisito}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-bold">{req.score}%</span>
                              <p className="text-xs text-gray-500">{getStatusLabel(req.status)}</p>
                            </div>
                          </div>
                          
                          {req.evidencias_encontradas?.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-medium text-green-700">✅ Evidências encontradas:</p>
                              <ul className="text-xs text-gray-600 ml-4">
                                {req.evidencias_encontradas.map((e, j) => (
                                  <li key={j}>• {e}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {req.evidencias_ausentes?.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-medium text-red-700">❌ Não encontrado:</p>
                              <ul className="text-xs text-gray-600 ml-4">
                                {req.evidencias_ausentes.map((e, j) => (
                                  <li key={j}>• {e}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Gaps */}
                  {abaResultado === 'gaps' && (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {analiseAdequacao.gaps_identificados?.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                          <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                          <p>Nenhum gap crítico identificado!</p>
                        </div>
                      ) : (
                        analiseAdequacao.gaps_identificados?.map((gap, i) => (
                          <div key={i} className="p-3 bg-gray-50 rounded-lg border">
                            <div className="flex items-start justify-between mb-2">
                              <p className="font-medium text-gray-800">{gap.requisito}</p>
                              <span className={`text-xs px-2 py-0.5 rounded ${getImpactoColor(gap.impacto)}`}>
                                Impacto {gap.impacto}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{gap.gap}</p>
                            <div className="p-2 bg-blue-50 rounded border border-blue-200">
                              <p className="text-xs font-medium text-blue-700 flex items-center gap-1">
                                <Lightbulb className="w-3 h-3" /> Sugestão de Mitigação
                              </p>
                              <p className="text-xs text-blue-600 mt-1">{gap.sugestao_mitigacao}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Perguntas */}
                  {abaResultado === 'perguntas' && (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {analiseAdequacao.perguntas_entrevista?.map((perg, i) => (
                        <div key={i} className="p-3 bg-gray-50 rounded-lg border">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                              {perg.tema}
                            </span>
                          </div>
                          <p className="font-medium text-gray-800 mb-2">❓ {perg.pergunta}</p>
                          <div className="space-y-1 text-xs text-gray-600">
                            <p><strong>🎯 Objetivo:</strong> {perg.objetivo}</p>
                            <p><strong>👀 Avaliar:</strong> {perg.o_que_avaliar}</p>
                            {perg.red_flags?.length > 0 && (
                              <p><strong>🚩 Red Flags:</strong> {perg.red_flags.join(', ')}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Indicador de Salvamento */}
                {salvouBanco && (
                  <div className="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-green-800">✅ Salvo automaticamente no Banco de Talentos</p>
                      <p className="text-sm text-green-600">O candidato foi adicionado à base de pessoas</p>
                    </div>
                  </div>
                )}

                {/* 🆕 v4.1: Opção de salvamento manual para score baixo */}
                {!salvouBanco && dadosParaSalvarManual && analiseAdequacao && (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-yellow-800">
                          ⚠️ Score abaixo de {SCORE_MINIMO_SALVAR}% - Não salvo automaticamente
                        </p>
                        <p className="text-sm text-yellow-700 mt-1">
                          Este candidato não atingiu o score mínimo para salvamento automático. 
                          Você pode salvá-lo manualmente se desejar.
                        </p>
                        <button
                          onClick={handleSalvarManual}
                          disabled={isSalvandoManual}
                          className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          {isSalvandoManual ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Salvando...
                            </>
                          ) : (
                            <>
                              <Database className="w-4 h-4" />
                              Salvar mesmo assim
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== ABA ALERTAS ===================== */}
      {abaAtiva === 'alertas' && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Candidaturas em Risco
            </h2>
            <button
              onClick={carregarAlertas}
              disabled={loadingAlertas}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <RefreshCw className={`w-5 h-5 ${loadingAlertas ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            Candidaturas em processo com risco de reprovação acima de 50%
          </p>

          {loadingAlertas ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 mx-auto text-orange-600 animate-spin" />
              <p className="text-gray-500 mt-2">Carregando alertas...</p>
            </div>
          ) : alertas.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium text-gray-600">Nenhum alerta de risco</p>
              <p className="text-sm">Todas as candidaturas em processo têm risco baixo</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alertas.map((alerta) => (
                <div
                  key={alerta.id}
                  className={`p-4 rounded-lg border-l-4 ${
                    alerta.risco_reprovacao >= 70 ? 'bg-red-50 border-red-500' :
                    'bg-orange-50 border-orange-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-800">{alerta.candidato_nome}</h3>
                      <p className="text-sm text-gray-600">{alerta.vaga_titulo}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${
                        alerta.risco_reprovacao >= 70 ? 'text-red-600' : 'text-orange-600'
                      }`}>
                        {alerta.risco_reprovacao}%
                      </p>
                      <p className="text-xs text-gray-500">risco de reprovação</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-xs px-2 py-1 rounded ${
                      alerta.recomendacao === 'rejeitar' ? 'bg-red-200 text-red-700' :
                      alerta.recomendacao === 'revisar' ? 'bg-yellow-200 text-yellow-700' :
                      'bg-blue-200 text-blue-700'
                    }`}>
                      {alerta.recomendacao}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(alerta.criado_em).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================== ABA MÉTRICAS ===================== */}
      {abaAtiva === 'metricas' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                Métricas de Acurácia da IA
              </h2>
              <button
                onClick={carregarMetricas}
                disabled={loadingMetricas}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <RefreshCw className={`w-5 h-5 ${loadingMetricas ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-6">
              Comparação entre as recomendações da IA e os resultados reais das candidaturas
            </p>

            {loadingMetricas ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 mx-auto text-blue-600 animate-spin" />
                <p className="text-gray-500 mt-2">Calculando métricas...</p>
              </div>
            ) : !metricas ? (
              <div className="text-center py-12 text-gray-400">
                <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium text-gray-600">Métricas não disponíveis</p>
                <p className="text-sm">Aguardando candidaturas com resultado final</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-blue-50 p-4 rounded-xl text-center">
                    <p className="text-3xl font-bold text-blue-600">{metricas.total_analises}</p>
                    <p className="text-sm text-gray-600">Total de Análises</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-xl text-center">
                    <p className="text-3xl font-bold text-purple-600">{metricas.com_resultado}</p>
                    <p className="text-sm text-gray-600">Com Resultado</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-xl text-center">
                    <p className="text-3xl font-bold text-green-600">{metricas.predicoes_corretas}</p>
                    <p className="text-sm text-gray-600">Predições Corretas</p>
                  </div>
                  <div className={`p-4 rounded-xl text-center ${
                    metricas.taxa_acerto >= 70 ? 'bg-green-100' :
                    metricas.taxa_acerto >= 50 ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    <p className={`text-3xl font-bold ${
                      metricas.taxa_acerto >= 70 ? 'text-green-600' :
                      metricas.taxa_acerto >= 50 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {metricas.taxa_acerto.toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-600">Taxa de Acerto</p>
                  </div>
                </div>

                <h3 className="font-semibold text-gray-700 mb-3">Acerto por Tipo de Recomendação</h3>
                <div className="grid grid-cols-4 gap-3">
                  {Object.entries(metricas.por_recomendacao).map(([tipo, dados]) => (
                    <div key={tipo} className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm font-medium text-gray-700 capitalize">{tipo}</p>
                      <p className="text-lg font-bold text-gray-800">
                        {dados.total > 0 ? ((dados.acertos / dados.total) * 100).toFixed(0) : 0}%
                      </p>
                      <p className="text-xs text-gray-500">
                        {dados.acertos}/{dados.total} acertos
                      </p>
                    </div>
                  ))}
                </div>

                {metricas.com_resultado === 0 && (
                  <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <strong>Nota:</strong> As métricas serão calculadas quando houver candidaturas 
                      com resultado final (contratado, reprovado, etc.)
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnaliseRisco;
