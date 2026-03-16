/**
 * DetalhesCandidaturaModal.tsx - Modal de Detalhes da Candidatura
 * 
 * Funcionalidades:
 * - Visualização completa dos dados do candidato
 * - Score de compatibilidade com a vaga
 * - Histórico de mudanças de status
 * - Ações rápidas (agendar entrevista, aprovar, reprovar)
 * - Motivo obrigatório para reprovação
 * - Observações e feedback
 * - 🆕 Análise de CV com IA (integração RAISA)
 * - 🆕 Análise de Adequação de Perfil (requisito a requisito)
 * 
 * FLUXO DE STATUS (Processos Internos):
 * Triagem → Entrevista → Aprovado/Reprovado
 * Aprovado → Envio Cliente → Aguardando → Entrevista Cliente
 * Entrevista Cliente → Aprovado Cliente/Reprovado Cliente
 * Aprovado Cliente → Contratado → (Consultor Ativo após Ficha)
 * 
 * Versão: 2.2 - Status 'Sem Interesse' com modal de motivos
 * Data: 16/03/2026
 */

import React, { useState, useEffect } from 'react';
import { 
  X, User, Mail, Phone, Briefcase, MapPin, Calendar,
  CheckCircle, XCircle, Clock, Send, FileText, 
  ChevronRight, AlertTriangle, MessageSquare, History,
  ExternalLink, Loader2, Star, Award, UserCheck, Building2,
  Brain, Target, RefreshCw, FileOutput, Download
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import { Candidatura, Vaga, Pessoa } from '@/types';
import { useCandidaturaAnaliseIA } from '@/hooks/supabase/useCandidaturaAnaliseIA';
import { useAnaliseAdequacao } from '@/hooks/supabase/useAnaliseAdequacao';
import AnaliseCVPanel from './AnaliseCVPanel';
import { AnaliseAdequacaoPanel } from './AnaliseAdequacaoPanel';
import { AnaliseAdequacaoBadge } from './AnaliseAdequacaoBadge';
import CVGeneratorV2 from './CVGeneratorV2';  // 🆕 v57.2: Gerador de CV Padronizado
import type { DadosCandidatoAnalise, DadosVagaAnalise } from '@/services/analiseAdequacaoService';

// ============================================
// TIPOS
// ============================================

interface DetalhesCandidaturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidatura: Candidatura;
  vaga?: Vaga;
  pessoa?: Pessoa;
  onStatusChange: (novoStatus: string, motivo?: string) => void;
  onReload?: () => void;
  currentUserId: number;
  currentUserName?: string;
}

interface HistoricoStatus {
  id?: number;
  status_anterior: string;
  status_novo: string;
  data_mudanca: string;
  usuario_id: number;
  usuario_nome?: string;
  motivo?: string;
  observacao?: string;
}

interface DadosExtras {
  skills?: string[];
  experiencias?: any[];
  formacoes?: any[];
  score_compatibilidade?: number;
  titulo_profissional?: string;
  senioridade?: string;
  disponibilidade?: string;
  pretensao_salarial?: number;
  idiomas?: any[];
  certificacoes?: any[];
  resumo_profissional?: string;
}

// ============================================
// CONFIGURAÇÕES DE STATUS - FLUXO CORRETO
// ============================================

const STATUS_CONFIG: Record<string, { 
  label: string; 
  cor: string; 
  bgCor: string;
  icon: any;
  proximosStatus: string[];
  etapa: number;
  descricao: string;
}> = {
  'triagem': { 
    label: 'Triagem', 
    cor: 'text-gray-700', 
    bgCor: 'bg-gray-100',
    icon: FileText,
    proximosStatus: ['entrevista'],
    etapa: 1,
    descricao: 'Análise inicial do currículo'
  },
  'indicacao_aprovada': { 
    label: 'Indicação Aprovada', 
    cor: 'text-amber-700', 
    bgCor: 'bg-amber-100',
    icon: UserCheck,
    proximosStatus: ['aguardando_cliente'],
    etapa: 4,
    descricao: 'Candidato indicado pelo cliente - aguardando confirmação formal'
  },
  'entrevista': { 
    label: 'Entrevista', 
    cor: 'text-blue-700', 
    bgCor: 'bg-blue-100',
    icon: MessageSquare,
    proximosStatus: ['aprovado', 'reprovado'],
    etapa: 2,
    descricao: 'Entrevista interna realizada'
  },
  'aprovado': { 
    label: 'Aprovado', 
    cor: 'text-green-700', 
    bgCor: 'bg-green-100',
    icon: CheckCircle,
    proximosStatus: ['enviado_cliente'],
    etapa: 3,
    descricao: 'Aprovado na entrevista interna'
  },
  'reprovado': { 
    label: 'Reprovado', 
    cor: 'text-red-700', 
    bgCor: 'bg-red-100',
    icon: XCircle,
    proximosStatus: [],
    etapa: 99,
    descricao: 'Reprovado na entrevista interna'
  },
  'enviado_cliente': { 
    label: 'Enviado ao Cliente', 
    cor: 'text-purple-700', 
    bgCor: 'bg-purple-100',
    icon: Send,
    proximosStatus: ['aguardando_cliente'],
    etapa: 4,
    descricao: 'CV enviado para o cliente'
  },
  'aguardando_cliente': { 
    label: 'Aguardando Cliente', 
    cor: 'text-orange-700', 
    bgCor: 'bg-orange-100',
    icon: Clock,
    proximosStatus: ['entrevista_cliente'],
    etapa: 5,
    descricao: 'Aguardando retorno do cliente'
  },
  'entrevista_cliente': { 
    label: 'Entrevista Cliente', 
    cor: 'text-indigo-700', 
    bgCor: 'bg-indigo-100',
    icon: Building2,
    proximosStatus: ['aprovado_cliente', 'reprovado_cliente'],
    etapa: 6,
    descricao: 'Entrevista com o cliente'
  },
  'aprovado_cliente': { 
    label: 'Aprovado pelo Cliente', 
    cor: 'text-emerald-700', 
    bgCor: 'bg-emerald-100',
    icon: CheckCircle,
    proximosStatus: ['contratado'],
    etapa: 7,
    descricao: 'Aprovado pelo cliente'
  },
  'reprovado_cliente': { 
    label: 'Reprovado pelo Cliente', 
    cor: 'text-rose-700', 
    bgCor: 'bg-rose-100',
    icon: XCircle,
    proximosStatus: [],
    etapa: 99,
    descricao: 'Reprovado pelo cliente'
  },
  'contratado': { 
    label: 'Contratado', 
    cor: 'text-teal-700', 
    bgCor: 'bg-teal-100',
    icon: UserCheck,
    proximosStatus: [],
    etapa: 8,
    descricao: 'Aguardando Ficha de Inclusão → Consultor Ativo'
  },
  'sem_interesse': { 
    label: 'Sem Interesse', 
    cor: 'text-amber-700', 
    bgCor: 'bg-amber-100',
    icon: AlertTriangle,
    proximosStatus: [],
    etapa: 9,
    descricao: 'Candidato declinou a proposta'
  }
};

// Motivos de reprovação interna
const MOTIVOS_REPROVACAO_INTERNA = [
  { value: 'tecnico', label: 'Conhecimento Técnico Insuficiente' },
  { value: 'experiencia', label: 'Experiência Insuficiente' },
  { value: 'comportamental', label: 'Fit Cultural/Comportamental' },
  { value: 'salario', label: 'Pretensão Salarial Incompatível' },
  { value: 'disponibilidade', label: 'Disponibilidade Incompatível' },
  { value: 'comunicacao', label: 'Problemas de Comunicação' },
  { value: 'desistencia', label: 'Candidato Desistiu' },
  { value: 'outro', label: 'Outro Motivo' }
];

// Motivos de reprovação pelo cliente
const MOTIVOS_REPROVACAO_CLIENTE = [
  { value: 'perfil_tecnico', label: 'Perfil Técnico Não Atende' },
  { value: 'experiencia_setor', label: 'Falta Experiência no Setor' },
  { value: 'cultural', label: 'Fit Cultural com a Empresa' },
  { value: 'salario', label: 'Pretensão Salarial' },
  { value: 'outro_candidato', label: 'Optou por Outro Candidato' },
  { value: 'vaga_cancelada', label: 'Vaga Cancelada/Suspensa' },
  { value: 'sem_retorno', label: 'Cliente Não Deu Retorno' },
  { value: 'outro', label: 'Outro Motivo' }
];

// Motivos de Sem Interesse (candidato declina a proposta)
const MOTIVOS_SEM_INTERESSE = [
  { value: 'aceita_somente_remoto',          label: 'Aceita somente Remoto' },
  { value: 'estabilidade_projeto',           label: 'Estabilidade no projeto' },
  { value: 'localizacao',                    label: 'Localização' },
  { value: 'nao_avaliando_propostas',        label: 'Não está avaliando propostas' },
  { value: 'sem_remuneracao',                label: 'Não participa sem saber a remuneração' },
  { value: 'sem_cliente',                    label: 'Não participa sem saber quem é o cliente' },
  { value: 'outro_motivo',                   label: 'Outro Motivo' },
  { value: 'sem_disponibilidade_viagem',     label: 'Sem disponibilidade para viagem' },
  { value: 'somente_clt',                    label: 'Só avalia a modalidade CLT' },
  { value: 'valor_abaixo_pretendido',        label: 'Valor abaixo do pretendido' },
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const DetalhesCandidaturaModal: React.FC<DetalhesCandidaturaModalProps> = ({
  isOpen,
  onClose,
  candidatura,
  vaga,
  pessoa,
  onStatusChange,
  onReload,
  currentUserId,
  currentUserName = 'Usuário'
}) => {
  // Estados
  const [abaAtiva, setAbaAtiva] = useState<'detalhes' | 'historico' | 'acoes'>('detalhes');
  const [historico, setHistorico] = useState<HistoricoStatus[]>([]);
  const [dadosExtras, setDadosExtras] = useState<DadosExtras>({});
  const [loading, setLoading] = useState(false);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  
  // Estados para mudança de status
  const [novoStatus, setNovoStatus] = useState<string>('');
  const [motivoReprovacao, setMotivoReprovacao] = useState<string>('');
  const [motivoOutro, setMotivoOutro] = useState<string>('');
  const [observacao, setObservacao] = useState<string>('');
  const [showConfirmacao, setShowConfirmacao] = useState(false);
  // 🆕 Sem Interesse
  const [showSemInteresseModal, setShowSemInteresseModal] = useState(false);
  const [motivoSemInteresse, setMotivoSemInteresse] = useState<string>('');

  // 🆕 v57.2: Estado para modal de Geração de CV Padronizado
  const [showCVGenerator, setShowCVGenerator] = useState(false);

  // Estado para expandir/recolher análise de adequação
  const [mostrarAnaliseAdequacao, setMostrarAnaliseAdequacao] = useState(false);

  // Hook para Análise de CV com IA (existente)
  const {
    loading: loadingAnaliseIA,
    error: errorAnaliseIA,
    analiseAtual,
    carregarAnalise,
    analisarCV,
    registrarFeedback,
    limparAnalise
  } = useCandidaturaAnaliseIA();

  // 🆕 Hook para Análise de Adequação de Perfil (NOVO)
  const {
    analise: analiseAdequacao,
    loading: loadingAdequacao,
    error: errorAdequacao,
    analisar: analisarAdequacao,
    salvarAnalise: salvarAnaliseAdequacao,
    carregarAnalise: carregarAnaliseAdequacao,
    estatisticas: statsAdequacao,
    desqualificacao
  } = useAnaliseAdequacao();

  // Configuração do status atual
  const statusAtual = STATUS_CONFIG[candidatura.status] || STATUS_CONFIG['triagem'];
  const StatusIcon = statusAtual.icon;

  // Verificar se é reprovação
  const isReprovacao = (status: string) => status === 'reprovado' || status === 'reprovado_cliente';
  
  // Verificar se é sem interesse
  const isSemInteresse = (status: string) => status === 'sem_interesse';
  
  // Verificar se currículo está disponível
  const curriculoDisponivel = !!(candidatura as any).curriculo_texto && 
    (candidatura as any).curriculo_texto.trim().length > 50;
  
  // Obter motivos corretos baseado no tipo de reprovação
  const getMotivosReprovacao = () => {
    if (novoStatus === 'reprovado_cliente') {
      return MOTIVOS_REPROVACAO_CLIENTE;
    }
    return MOTIVOS_REPROVACAO_INTERNA;
  };

  // ============================================
  // CARREGAR DADOS
  // ============================================

  useEffect(() => {
    if (isOpen && candidatura) {
      carregarHistorico();
      carregarDadosExtras();
      // Carregar análise de CV existente
      carregarAnalise(parseInt(candidatura.id));
      // 🆕 Carregar análise de adequação existente
      carregarAnaliseAdequacao(parseInt(candidatura.id));
    } else {
      // Limpar análises ao fechar modal
      limparAnalise();
      setMostrarAnaliseAdequacao(false);
    }
  }, [isOpen, candidatura]);

  const carregarHistorico = async () => {
    setLoadingHistorico(true);
    try {
      const { data, error } = await supabase
        .from('candidatura_historico_status')
        .select(`
          id,
          status_anterior,
          status_novo,
          data_mudanca,
          usuario_id,
          motivo,
          observacao,
          usuario:app_users(nome_usuario)
        `)
        .eq('candidatura_id', candidatura.id)
        .order('data_mudanca', { ascending: false });

      if (!error && data) {
        setHistorico(data.map(h => ({
          ...h,
          usuario_nome: (h.usuario as any)?.nome_usuario || 'Sistema'
        })));
      } else {
        setHistorico([{
          status_anterior: '-',
          status_novo: candidatura.status,
          data_mudanca: (candidatura as any).criado_em || candidatura.createdAt || new Date().toISOString(),
          usuario_id: 0,
          usuario_nome: 'Sistema',
          observacao: 'Candidatura criada'
        }]);
      }
    } catch (err) {
      console.warn('Histórico não disponível:', err);
      setHistorico([]);
    } finally {
      setLoadingHistorico(false);
    }
  };

  const carregarDadosExtras = async () => {
    if (!candidatura.pessoa_id) return;

    try {
      const { data: pessoaData } = await supabase
        .from('pessoas')
        .select('*')
        .eq('id', candidatura.pessoa_id)
        .single();

      const { data: skillsData } = await supabase
        .from('pessoa_skills')
        .select('skill_nome, nivel')
        .eq('pessoa_id', candidatura.pessoa_id);

      const { data: expData } = await supabase
        .from('pessoa_experiencias')
        .select('*')
        .eq('pessoa_id', candidatura.pessoa_id)
        .order('data_inicio', { ascending: false });

      const { data: formData } = await supabase
        .from('pessoa_formacao')
        .select('*')
        .eq('pessoa_id', candidatura.pessoa_id);

      setDadosExtras({
        skills: skillsData?.map(s => s.skill_nome) || [],
        experiencias: expData || [],
        formacoes: formData || [],
        titulo_profissional: pessoaData?.titulo_profissional,
        senioridade: pessoaData?.senioridade,
        disponibilidade: pessoaData?.disponibilidade,
        pretensao_salarial: pessoaData?.pretensao_salarial,
        score_compatibilidade: pessoaData?.score_compatibilidade,
        idiomas: pessoaData?.idiomas || [],
        certificacoes: pessoaData?.certificacoes || [],
        resumo_profissional: pessoaData?.resumo_profissional
      });
    } catch (err) {
      console.warn('Erro ao carregar dados extras:', err);
    }
  };

  // ============================================
  // HANDLERS
  // ============================================

  // Handler para analisar CV com IA (existente)
  const handleAnalisarCV = async () => {
    if (!vaga) {
      alert('Dados da vaga não disponíveis para análise.');
      return;
    }
    
    await analisarCV(candidatura, vaga, currentUserId);
  };

  // Handler para feedback da análise
  const handleFeedbackAnalise = async (util: boolean, texto?: string) => {
    if (analiseAtual?.id) {
      await registrarFeedback(analiseAtual.id, util, texto, currentUserId);
    }
  };

  // 🆕 Handler para Análise de Adequação de Perfil (NOVO)
  const handleAnalisarAdequacao = async () => {
    if (!vaga) {
      alert('Dados da vaga não disponíveis para análise de adequação.');
      return;
    }

    // Preparar dados do candidato
    const dadosCandidato: DadosCandidatoAnalise = {
      nome: candidatura.candidato_nome || pessoa?.nome || 'Candidato',
      titulo_profissional: dadosExtras.titulo_profissional,
      senioridade: dadosExtras.senioridade,
      resumo_profissional: dadosExtras.resumo_profissional || pessoa?.resumo_profissional,
      skills: dadosExtras.skills,
      experiencias: dadosExtras.experiencias?.map(exp => ({
        empresa: exp.empresa,
        cargo: exp.cargo,
        periodo: exp.periodo,
        data_inicio: exp.data_inicio,
        data_fim: exp.data_fim,
        descricao: exp.descricao,
        tecnologias: exp.tecnologias || []
      })),
      formacoes: dadosExtras.formacoes,
      idiomas: dadosExtras.idiomas,
      certificacoes: dadosExtras.certificacoes,
      curriculo_texto: (candidatura as any).curriculo_texto
    };

    // Preparar dados da vaga
    const dadosVaga: DadosVagaAnalise = {
      titulo: vaga?.titulo || 'Vaga',
      descricao: vaga?.descricao,
      requisitos_obrigatorios: Array.isArray((vaga as any)?.requisitos_obrigatorios) 
        ? (vaga as any).requisitos_obrigatorios.join('\n') 
        : (vaga as any)?.requisitos_obrigatorios || (vaga as any)?.requisitos,
      requisitos_desejaveis: Array.isArray((vaga as any)?.requisitos_desejaveis)
        ? (vaga as any).requisitos_desejaveis.join('\n')
        : (vaga as any)?.requisitos_desejaveis,
      stack_tecnologica: (vaga as any)?.stack_tecnologica || (vaga as any)?.tecnologias,
      senioridade: (vaga as any)?.senioridade || (vaga as any)?.nivel_senioridade,
      modalidade: (vaga as any)?.modalidade,
      cliente_nome: (vaga as any)?.cliente_nome || (vaga as any)?.cliente?.nome
    };

    // Executar análise
    const resultado = await analisarAdequacao(dadosCandidato, dadosVaga);
    
    if (resultado) {
      // Salvar no banco automaticamente - passando resultado diretamente
      await salvarAnaliseAdequacao(
        parseInt(candidatura.id),                                            // candidaturaId
        candidatura.pessoa_id ? Number(candidatura.pessoa_id) : undefined,   // pessoaId
        vaga?.id ? parseInt(String(vaga.id)) : undefined,                    // vagaId
        currentUserId,                                                       // userId
        resultado                                                            // resultado da análise
      );
      // Expandir painel para mostrar resultado
      setMostrarAnaliseAdequacao(true);
    }
  };

  // Registrar resultado real da análise (para métricas de acurácia)
  const registrarResultadoRealAnalise = async (candidaturaId: number, statusFinal: string) => {
    try {
      // Buscar análise de CV mais recente para esta candidatura
      const { data: analise } = await supabase
        .from('ia_recomendacoes_candidato')
        .select('id, recomendacao')
        .eq('candidatura_id', candidaturaId)
        .eq('tipo_recomendacao', 'analise_cv')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!analise) {
        console.log('Nenhuma análise de CV encontrada para registrar resultado');
        return;
      }

      // Determinar se a predição foi correta
      const resultadosPositivos = ['contratado', 'aprovado_cliente'];
      const resultadosNegativos = ['reprovado', 'reprovado_cliente', 'desistencia'];
      
      const foiAprovado = resultadosPositivos.includes(statusFinal);
      const iaRecomendou = ['aprovar', 'entrevistar'].includes(analise.recomendacao);
      const predicaoCorreta = foiAprovado === iaRecomendou;

      // Atualizar a análise com o resultado real
      await supabase
        .from('ia_recomendacoes_candidato')
        .update({
          resultado_real: statusFinal,
          predicao_correta: predicaoCorreta,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', analise.id);

      console.log(`✅ Resultado real registrado: ${statusFinal} (Predição ${predicaoCorreta ? 'correta' : 'incorreta'})`);
    } catch (err) {
      console.error('Erro ao registrar resultado real:', err);
    }
  };

  const handleMudarStatus = async () => {
    if (!novoStatus) return;

    // Validar motivo para reprovação
    if (isReprovacao(novoStatus) && !motivoReprovacao) {
      alert('Por favor, selecione um motivo para a reprovação');
      return;
    }

    setLoading(true);
    try {
      const motivoFinal = motivoReprovacao === 'outro' ? motivoOutro : 
        getMotivosReprovacao().find(m => m.value === motivoReprovacao)?.label || motivoReprovacao;

      // 1. Atualizar status da candidatura
      const updatePayload: any = {
        status: novoStatus,
        atualizado_em: new Date().toISOString(),
        observacoes: observacao ? 
          `${candidatura.observacoes || ''}\n\n[${new Date().toLocaleString('pt-BR')}] ${observacao}`.trim() : 
          candidatura.observacoes
      };

      // 🆕 Salvar motivo_sem_interesse quando aplicável
      if (isSemInteresse(novoStatus) && motivoSemInteresse) {
        const motivoLabel = MOTIVOS_SEM_INTERESSE.find(m => m.value === motivoSemInteresse)?.label || motivoSemInteresse;
        updatePayload.motivo_sem_interesse = motivoLabel;
      }

      const { error: updateError } = await supabase
        .from('candidaturas')
        .update(updatePayload)
        .eq('id', candidatura.id);

      if (updateError) throw updateError;

      // 2. Registrar no histórico
      await supabase
        .from('candidatura_historico_status')
        .insert({
          candidatura_id: parseInt(candidatura.id),
          status_anterior: candidatura.status,
          status_novo: novoStatus,
          data_mudanca: new Date().toISOString(),
          usuario_id: currentUserId,
          motivo: isReprovacao(novoStatus) ? motivoFinal : null,
          observacao: observacao || null
        });

      // 3. Registrar resultado_real na análise de IA (para métricas)
      const statusFinais = ['contratado', 'reprovado', 'reprovado_cliente', 'aprovado_cliente', 'desistencia'];
      if (statusFinais.includes(novoStatus)) {
        await registrarResultadoRealAnalise(parseInt(candidatura.id), novoStatus);
      }

      // 4. Callback
      onStatusChange(novoStatus, motivoFinal);
      
      // Resetar estados
      setNovoStatus('');
      setMotivoReprovacao('');
      setMotivoOutro('');
      setObservacao('');
      setShowConfirmacao(false);
      setShowSemInteresseModal(false);
      setMotivoSemInteresse('');

      await carregarHistorico();

      if (onReload) onReload();

      alert(`✅ Status alterado para: ${STATUS_CONFIG[novoStatus]?.label || novoStatus}`);

    } catch (err: any) {
      console.error('Erro ao mudar status:', err);
      alert(`Erro ao mudar status: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAcaoRapida = (status: string) => {
    setNovoStatus(status);
    setShowConfirmacao(true);
  };

  // ============================================
  // RENDER
  // ============================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* ============================================ */}
        {/* HEADER */}
        {/* ============================================ */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl font-bold">
                {(candidatura.candidato_nome || pessoa?.nome || 'C').charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-2xl font-bold">
                  {candidatura.candidato_nome || pessoa?.nome || 'Candidato'}
                </h2>
                <p className="text-blue-100 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  {vaga?.titulo || `Vaga #${candidatura.vaga_id}`}
                </p>
                <div className={`inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full text-sm font-semibold ${statusAtual.bgCor} ${statusAtual.cor}`}>
                  <StatusIcon className="w-4 h-4" />
                  {statusAtual.label}
                </div>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="text-white/80 hover:text-white p-2"
            >
              <X className="w-8 h-8" />
            </button>
          </div>

          {/* Barra de Progresso do Fluxo */}
          <div className="mt-4 pt-4 border-t border-white/20">
            <div className="flex items-center justify-between text-xs">
              {['Triagem', 'Entrevista', 'Aprovado', 'Env. Cliente', 'Aguardando', 'Entrev. Cliente', 'Aprov. Cliente', 'Contratado', 'Sem Int.'].map((etapa, index) => {
                const etapaNum = index + 1;
                const isAtual = statusAtual.etapa === etapaNum;
                const isPast = statusAtual.etapa > etapaNum && statusAtual.etapa !== 99;
                const isFinal = statusAtual.etapa === 99; // Reprovado/Reprovado Cliente
                const isSemInt = statusAtual.etapa === 9 && etapaNum === 9;
                
                return (
                  <div key={index} className="flex flex-col items-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isSemInt ? 'bg-amber-400 text-white' :
                      isAtual ? 'bg-white text-blue-600' :
                      isPast ? 'bg-green-400 text-white' :
                      isFinal && index < 3 ? 'bg-red-400 text-white' :
                      'bg-white/30 text-white/70'
                    }`}>
                      {isPast ? '✓' : isSemInt ? '😔' : isFinal && index === 2 ? '✗' : etapaNum}
                    </div>
                    <span className={`mt-1 ${isAtual || isSemInt ? 'text-white font-semibold' : 'text-white/60'}`}>
                      {etapa}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ============================================ */}
        {/* ABAS */}
        {/* ============================================ */}
        <div className="bg-gray-100 px-6 py-3 flex gap-2 border-b">
          <button
            onClick={() => setAbaAtiva('detalhes')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              abaAtiva === 'detalhes' 
                ? 'bg-white text-blue-600 shadow' 
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            <User className="w-4 h-4 inline mr-2" />
            Detalhes
          </button>
          <button
            onClick={() => setAbaAtiva('historico')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              abaAtiva === 'historico' 
                ? 'bg-white text-blue-600 shadow' 
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            <History className="w-4 h-4 inline mr-2" />
            Histórico ({historico.length})
          </button>
          <button
            onClick={() => setAbaAtiva('acoes')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              abaAtiva === 'acoes' 
                ? 'bg-white text-blue-600 shadow' 
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            <ChevronRight className="w-4 h-4 inline mr-2" />
            Ações
          </button>
        </div>

        {/* ============================================ */}
        {/* CONTEÚDO */}
        {/* ============================================ */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* ABA: DETALHES */}
          {abaAtiva === 'detalhes' && (
            <div className="space-y-6">
              {/* Status Atual */}
              <div className={`${statusAtual.bgCor} rounded-xl p-4 border`}>
                <div className="flex items-center gap-3">
                  <StatusIcon className={`w-8 h-8 ${statusAtual.cor}`} />
                  <div>
                    <p className={`font-bold text-lg ${statusAtual.cor}`}>{statusAtual.label}</p>
                    <p className="text-sm text-gray-600">{statusAtual.descricao}</p>
                  </div>
                </div>
              </div>

              {/* Informações de Contato */}
              <div className="bg-gray-50 rounded-xl p-5">
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  Informações de Contato
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Email</p>
                      <p className="font-medium">{candidatura.candidato_email || pessoa?.email || 'Não informado'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Telefone</p>
                      <p className="font-medium">{pessoa?.telefone || 'Não informado'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Cargo/Senioridade</p>
                      <p className="font-medium">
                        {dadosExtras.titulo_profissional || 'Não informado'} 
                        {dadosExtras.senioridade && ` • ${dadosExtras.senioridade}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Disponibilidade</p>
                      <p className="font-medium">{dadosExtras.disponibilidade || 'A combinar'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Score de Compatibilidade (estático - da tabela pessoas) */}
              {dadosExtras.score_compatibilidade && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-500" />
                    Score de Compatibilidade (Cadastro)
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="text-4xl font-bold text-blue-600">
                      {dadosExtras.score_compatibilidade}%
                    </div>
                    <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          dadosExtras.score_compatibilidade >= 80 ? 'bg-green-500' :
                          dadosExtras.score_compatibilidade >= 60 ? 'bg-yellow-500' :
                          dadosExtras.score_compatibilidade >= 40 ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${dadosExtras.score_compatibilidade}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================ */}
              {/* 🆕 ANÁLISE DE ADEQUAÇÃO DE PERFIL (NOVO!) */}
              {/* ============================================ */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 overflow-hidden">
                {/* Header da seção */}
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <Brain className="w-7 h-7 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-800 text-lg">Análise de Adequação</h3>
                        <p className="text-sm text-gray-500">Análise profunda requisito a requisito</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Badge de status */}
                      {analiseAdequacao && (
                        <AnaliseAdequacaoBadge
                          analise={analiseAdequacao}
                          loading={loadingAdequacao}
                        />
                      )}
                      
                      {/* Botão analisar */}
                      {!analiseAdequacao && !loadingAdequacao && vaga && (
                        <button
                          onClick={handleAnalisarAdequacao}
                          disabled={loadingAdequacao}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 font-medium"
                        >
                          <Target className="w-4 h-4" />
                          Analisar Adequação
                        </button>
                      )}
                      
                      {/* Loading */}
                      {loadingAdequacao && (
                        <div className="flex items-center gap-2 text-indigo-600">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-sm">Analisando...</span>
                        </div>
                      )}
                      
                      {/* Botão reanalisar */}
                      {analiseAdequacao && !loadingAdequacao && (
                        <button
                          onClick={handleAnalisarAdequacao}
                          disabled={loadingAdequacao}
                          className="px-3 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition text-sm flex items-center gap-1 border"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Reanalisar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Aviso se não tem vaga vinculada */}
                  {!vaga && (
                    <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      A vaga não está disponível. Não é possível analisar adequação.
                    </div>
                  )}

                  {/* Erro */}
                  {errorAdequacao && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
                      <XCircle className="w-5 h-5" />
                      {errorAdequacao}
                    </div>
                  )}

                  {/* Alerta de desqualificação */}
                  {desqualificacao?.desqualificado && (
                    <div className="mt-4 bg-red-100 border border-red-300 rounded-lg p-4">
                      <div className="font-semibold text-red-800 flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        ⚠️ Gaps Eliminatórios Identificados
                      </div>
                      <ul className="text-sm text-red-700 space-y-1">
                        {desqualificacao.motivos.slice(0, 3).map((m, i) => (
                          <li key={i}>• {m}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Resumo rápido quando tem análise */}
                  {analiseAdequacao && statsAdequacao && !mostrarAnaliseAdequacao && (
                    <div className="mt-4 grid grid-cols-4 gap-3">
                      <div className="text-center p-3 bg-white rounded-lg border">
                        <div className="text-2xl font-bold text-indigo-600">{analiseAdequacao.score_geral}%</div>
                        <div className="text-xs text-gray-500">Score</div>
                      </div>
                      <div className="text-center p-3 bg-white rounded-lg border">
                        <div className="text-2xl font-bold text-green-600">{statsAdequacao.atende}</div>
                        <div className="text-xs text-gray-500">Atende</div>
                      </div>
                      <div className="text-center p-3 bg-white rounded-lg border">
                        <div className="text-2xl font-bold text-yellow-600">{statsAdequacao.atendeParcialmente}</div>
                        <div className="text-xs text-gray-500">Parcial</div>
                      </div>
                      <div className="text-center p-3 bg-white rounded-lg border">
                        <div className="text-2xl font-bold text-red-600">{statsAdequacao.gaps}</div>
                        <div className="text-xs text-gray-500">Gaps</div>
                      </div>
                    </div>
                  )}

                  {/* Botão expandir/recolher */}
                  {analiseAdequacao && (
                    <button
                      onClick={() => setMostrarAnaliseAdequacao(!mostrarAnaliseAdequacao)}
                      className="mt-4 w-full py-2 text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center justify-center gap-1"
                    >
                      {mostrarAnaliseAdequacao ? '▲ Recolher análise detalhada' : '▼ Ver análise detalhada'}
                    </button>
                  )}
                </div>

                {/* Painel completo expandido */}
                {analiseAdequacao && mostrarAnaliseAdequacao && (
                  <div className="border-t">
                    <AnaliseAdequacaoPanel
                      analise={analiseAdequacao}
                      onAddPergunta={(pergunta) => {
                        console.log('Pergunta adicionada:', pergunta);
                        alert(`Pergunta copiada: "${pergunta.substring(0, 50)}..."`);
                      }}
                      onExportar={() => {
                        console.log('Exportar PDF da análise');
                        alert('Funcionalidade de exportar PDF em breve!');
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Análise de CV com IA (existente) */}
              <AnaliseCVPanel
                analise={analiseAtual}
                loading={loadingAnaliseIA}
                error={errorAnaliseIA}
                onAnalisar={handleAnalisarCV}
                onFeedback={handleFeedbackAnalise}
                curriculoDisponivel={curriculoDisponivel}
              />

              {/* Skills */}
              {dadosExtras.skills && dadosExtras.skills.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Award className="w-5 h-5 text-purple-600" />
                    Skills ({dadosExtras.skills.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {dadosExtras.skills.map((skill, i) => (
                      <span key={i} className="bg-white border border-gray-200 px-3 py-1 rounded-full text-sm">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Experiências Recentes */}
              {dadosExtras.experiencias && dadosExtras.experiencias.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-green-600" />
                    Últimas Experiências ({dadosExtras.experiencias.length})
                  </h3>
                  <div className="space-y-3">
                    {dadosExtras.experiencias.slice(0, 5).map((exp, i) => (
                      <div key={i} className="bg-white rounded-lg p-4 border">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-800">{exp.cargo}</p>
                            <p className="text-sm text-gray-600">{exp.empresa}</p>
                          </div>
                          {exp.atual && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                              Atual
                            </span>
                          )}
                        </div>
                        {/* 🆕 v2.1: Período */}
                        {(exp.data_inicio || exp.data_fim) && (
                          <p className="text-xs text-gray-500 mt-1">
                            {exp.data_inicio || '?'} - {exp.atual ? 'Atual' : (exp.data_fim || '?')}
                          </p>
                        )}
                        {/* 🆕 v2.1: DESCRIÇÃO - NOVA FUNCIONALIDADE */}
                        {exp.descricao && (
                          <p className="text-sm text-gray-600 mt-2 line-clamp-3">
                            {exp.descricao}
                          </p>
                        )}
                        {/* 🆕 v2.1: Tecnologias */}
                        {exp.tecnologias_usadas && exp.tecnologias_usadas.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {exp.tecnologias_usadas.slice(0, 5).map((tech: string, j: number) => (
                              <span key={j} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                {tech}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Observações */}
              {candidatura.observacoes && (
                <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-200">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-yellow-600" />
                    Observações
                  </h3>
                  <p className="text-gray-700 whitespace-pre-wrap text-sm">
                    {candidatura.observacoes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ABA: HISTÓRICO */}
          {abaAtiva === 'historico' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                Histórico de Status
              </h3>
              
              {loadingHistorico ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
                </div>
              ) : historico.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Nenhum histórico disponível</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                  
                  {historico.map((item, index) => {
                    const config = STATUS_CONFIG[item.status_novo] || STATUS_CONFIG['triagem'];
                    const ItemIcon = config.icon;
                    
                    return (
                      <div key={index} className="relative pl-10 pb-6">
                        <div className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center ${config.bgCor}`}>
                          <ItemIcon className={`w-4 h-4 ${config.cor}`} />
                        </div>
                        
                        <div className="bg-white rounded-lg border p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${config.bgCor} ${config.cor}`}>
                                {config.label}
                              </span>
                              {item.status_anterior !== '-' && (
                                <span className="text-gray-400 text-xs ml-2">
                                  (de: {STATUS_CONFIG[item.status_anterior]?.label || item.status_anterior})
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(item.data_mudanca).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          
                          <p className="text-sm text-gray-600 mt-2">
                            Por: <strong>{item.usuario_nome}</strong>
                          </p>
                          
                          {item.motivo && (
                            <p className="text-sm text-red-600 mt-1">
                              <AlertTriangle className="w-3 h-3 inline mr-1" />
                              Motivo: {item.motivo}
                            </p>
                          )}
                          
                          {item.observacao && (
                            <p className="text-sm text-gray-500 mt-1 italic">
                              "{item.observacao}"
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ABA: AÇÕES */}
          {abaAtiva === 'acoes' && (
            <div className="space-y-6">
              
              {/* 🆕 v57.2: Geração de CV Padronizado */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <FileOutput className="w-5 h-5 text-blue-600" />
                  Geração de CV Padronizado
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Gere um CV formatado para envio ao cliente. Escolha entre templates Techfor ou T-Systems, 
                  com opção de anonimizar o nome do candidato.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCVGenerator(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    <FileText className="w-4 h-4" />
                    Gerar CV Padronizado
                  </button>
                  {/* TODO: Mostrar status se já existe CV gerado */}
                </div>
              </div>

              {/* Próximo passo sugerido */}
              {statusAtual.proximosStatus.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <ChevronRight className="w-5 h-5 text-blue-600" />
                    Próximo Passo
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {statusAtual.proximosStatus.map(status => {
                      const config = STATUS_CONFIG[status];
                      if (!config) return null;
                      const BtnIcon = config.icon;
                      const isReprov = isReprovacao(status);
                      
                      return (
                        <button
                          key={status}
                          onClick={() => handleAcaoRapida(status)}
                          className={`p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                            isReprov 
                              ? 'border-red-200 hover:border-red-400 bg-red-50' 
                              : 'border-green-200 hover:border-green-400 bg-green-50'
                          }`}
                        >
                          <BtnIcon className={`w-6 h-6 mb-2 ${config.cor}`} />
                          <p className="font-semibold text-gray-800">{config.label}</p>
                          <p className="text-xs text-gray-500 mt-1">{config.descricao}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {statusAtual.proximosStatus.length === 0 && (
                <div className={`rounded-xl p-6 text-center ${
                  isReprovacao(candidatura.status) || isSemInteresse(candidatura.status)
                    ? isSemInteresse(candidatura.status)
                      ? 'bg-amber-50 border border-amber-200'
                      : 'bg-red-50 border border-red-200'
                    : 'bg-green-50 border border-green-200'
                }`}>
                  {isSemInteresse(candidatura.status) ? (
                    <>
                      <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                      <p className="text-gray-700 font-medium">😔 Candidato Declinou a Proposta</p>
                      <p className="text-sm text-gray-500">
                        {(candidatura as any).motivo_sem_interesse
                          ? `Motivo: ${(candidatura as any).motivo_sem_interesse}`
                          : 'O candidato não tem interesse nesta oportunidade.'}
                      </p>
                    </>
                  ) : isReprovacao(candidatura.status) ? (
                    <>
                      <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                      <p className="text-gray-700 font-medium">Processo Encerrado</p>
                      <p className="text-sm text-gray-500">Este candidato foi reprovado.</p>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-12 h-12 text-green-500 mx-auto mb-3" />
                      <p className="text-gray-700 font-medium">🎉 Candidato Contratado!</p>
                      <p className="text-sm text-gray-500">Aguardando Ficha de Inclusão para ativar como Consultor.</p>
                    </>
                  )}
                </div>
              )}

              {/* Mudança Manual */}
              {statusAtual.proximosStatus.length > 0 && (
                <div className="border-t pt-6">
                  <h3 className="font-semibold text-gray-800 mb-4 text-sm text-gray-500">
                    Ou selecione outro status (fora do fluxo):
                  </h3>
                  <select
                    value={novoStatus}
                    onChange={e => {
                      const val = e.target.value;
                      setNovoStatus(val);
                      if (val === 'sem_interesse') {
                        setShowSemInteresseModal(true);
                      } else if (val) {
                        setShowConfirmacao(true);
                      }
                    }}
                    className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-blue-500"
                  >
                    <option value="">Selecionar status...</option>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <option key={key} value={key} disabled={key === candidatura.status}>
                        {config.label} {key === candidatura.status ? '(atual)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* 🆕 MODAL SEM INTERESSE */}
          {showSemInteresseModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800">
                    😔 Candidato Sem Interesse
                  </h3>
                </div>

                <p className="text-sm text-gray-600 mb-4">
                  Selecione o motivo pelo qual o candidato <strong>{candidatura.candidato_nome || pessoa?.nome}</strong> declinou a proposta para a vaga <strong>{vaga?.titulo}</strong>.
                </p>

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Motivo do Declínio *
                  </label>
                  <select
                    value={motivoSemInteresse}
                    onChange={e => setMotivoSemInteresse(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">Selecione o motivo...</option>
                    {MOTIVOS_SEM_INTERESSE.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Observação (opcional)
                  </label>
                  <textarea
                    value={observacao}
                    onChange={e => setObservacao(e.target.value)}
                    placeholder="Adicione detalhes sobre o declínio..."
                    className="w-full border rounded-lg p-2 h-20 resize-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowSemInteresseModal(false);
                      setNovoStatus('');
                      setMotivoSemInteresse('');
                      setObservacao('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    disabled={loading}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleMudarStatus}
                    disabled={loading || !motivoSemInteresse}
                    className="flex-1 px-4 py-2 rounded-lg text-white font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      'Confirmar'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL DE CONFIRMAÇÃO */}
          {showConfirmacao && novoStatus && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  {isReprovacao(novoStatus) ? '❌ Confirmar Reprovação' : '✅ Confirmar Mudança de Status'}
                </h3>
                
                <div className="flex items-center gap-2 mb-4">
                  <span className={`px-3 py-1 rounded-full text-sm ${statusAtual.bgCor} ${statusAtual.cor}`}>
                    {statusAtual.label}
                  </span>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                  <span className={`px-3 py-1 rounded-full text-sm ${STATUS_CONFIG[novoStatus]?.bgCor} ${STATUS_CONFIG[novoStatus]?.cor}`}>
                    {STATUS_CONFIG[novoStatus]?.label}
                  </span>
                </div>

                {/* Motivo de Reprovação */}
                {isReprovacao(novoStatus) && (
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {novoStatus === 'reprovado_cliente' ? 'Considerações/Motivação do Cliente *' : 'Motivo da Reprovação *'}
                    </label>
                    <select
                      value={motivoReprovacao}
                      onChange={e => setMotivoReprovacao(e.target.value)}
                      className="w-full border rounded-lg p-2 mb-2"
                      required
                    >
                      <option value="">Selecione o motivo...</option>
                      {getMotivosReprovacao().map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    
                    {motivoReprovacao === 'outro' && (
                      <input
                        type="text"
                        value={motivoOutro}
                        onChange={e => setMotivoOutro(e.target.value)}
                        placeholder="Descreva o motivo..."
                        className="w-full border rounded-lg p-2"
                        required
                      />
                    )}
                  </div>
                )}

                {/* Observação */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Observação {isReprovacao(novoStatus) ? '(recomendado)' : '(opcional)'}
                  </label>
                  <textarea
                    value={observacao}
                    onChange={e => setObservacao(e.target.value)}
                    placeholder={isReprovacao(novoStatus) 
                      ? "Adicione detalhes sobre a reprovação..." 
                      : "Adicione uma observação sobre esta mudança..."}
                    className="w-full border rounded-lg p-2 h-20 resize-none"
                  />
                </div>

                {/* Botões */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowConfirmacao(false);
                      setNovoStatus('');
                      setMotivoReprovacao('');
                      setObservacao('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    disabled={loading}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleMudarStatus}
                    disabled={loading || (isReprovacao(novoStatus) && !motivoReprovacao)}
                    className={`flex-1 px-4 py-2 rounded-lg text-white font-semibold disabled:opacity-50 ${
                      isReprovacao(novoStatus) 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      'Confirmar'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================ */}
        {/* FOOTER */}
        {/* ============================================ */}
        <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
          <div className="text-sm text-gray-500">
            <Calendar className="w-4 h-4 inline mr-1" />
            Criado em: {new Date((candidatura as any).criado_em || candidatura.createdAt || '').toLocaleDateString('pt-BR')}
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* 🆕 v57.2: Modal de Geração de CV Padronizado */}
      {showCVGenerator && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
          <CVGeneratorV2
            candidaturaId={Number(candidatura.id)}
            candidatoNome={candidatura.candidato_nome || pessoa?.nome || 'Candidato'}
            pessoaDados={{
              nome_anoni_parcial: pessoa?.nome_anoni_parcial,
              nome_anoni_total: pessoa?.nome_anoni_total,
              email: pessoa?.email,
              telefone: pessoa?.telefone,
              cidade: pessoa?.cidade,
              estado: pessoa?.estado
            }}
            vagaInfo={vaga ? {
              id: Number(vaga.id),
              titulo: vaga.titulo || '',
              codigo: vaga.codigo || '',
              cliente: vaga.cliente_nome || '',
              gestor: '',
              requisitos: typeof vaga.requisitos === 'string' ? vaga.requisitos : JSON.stringify(vaga.requisitos || ''),
              stack_tecnologica: vaga.stack_tecnologica
            } : undefined}
            cvOriginalTexto={pessoa?.cv_texto_original}
            onClose={() => setShowCVGenerator(false)}
            onCVGerado={(cvId) => {
              console.log('✅ CV gerado com ID:', cvId);
              // Aqui pode adicionar lógica para atualizar o status ou recarregar dados
            }}
            currentUserId={currentUserId}
          />
        </div>
      )}
    </div>
  );
};

export default DetalhesCandidaturaModal;
