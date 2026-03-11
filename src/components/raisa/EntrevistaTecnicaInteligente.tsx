/**
 * EntrevistaTecnicaInteligente.tsx - RMS RAISA v3.0
 * Componente de Entrevista Técnica com IA
 * 
 * NOVO FLUXO:
 * 1. Seleciona candidatura
 * 2. Busca perguntas da análise de adequação (ou gera novas)
 * 3. Upload de gravação da entrevista
 * 4. Transcrição automática (Gemini)
 * 5. Análise das respostas vs perguntas
 * 6. Score e recomendação
 * 7. Decisão do analista
 * 
 * NOVIDADES v3.0 (27/02/2026):
 * - 🆕 Botão "Baixar DOCX" substitui "Baixar PDF"
 *   • Gera DOCX via API backend (/api/entrevista-docx)
 *   • Papel timbrado TechFor (mesmo background do Gerador de CV)
 *   • Perguntas organizadas por categoria com cores
 *   • Linhas pontilhadas para anotações
 *   • Seção de Observações Gerais
 *   • Rodapé com paginação automática
 *   • Removida dependência de jsPDF no frontend
 * 
 * NOVIDADES v2.9.2 (28/01/2026):
 * - 🔧 CORREÇÃO CRÍTICA: Usar String() na comparação de analista_id
 *   • Evita problemas de tipo (number vs string)
 *   • Removido campo criado_por que trazia candidaturas extras
 *   • Adicionado console.log para debug
 * 
 * NOVIDADES v2.9.1 (28/01/2026):
 * - 🔧 CORREÇÃO CRÍTICA: Dropdown agora filtra candidaturas pelo analista logado
 *   • Mostra apenas candidaturas onde analista_id = currentUserId
 * 
 * NOVIDADES v2.9 (19/01/2025):
 * - 🔧 CORREÇÃO CRÍTICA: Função salvarDecisao agora ATUALIZA O STATUS DA CANDIDATURA
 *   • Aprovado → status 'aprovado' (permite gerar CV, enviar ao cliente)
 *   • Reprovado → status 'reprovado_interno' (finaliza processo)
 * 
 * NOVIDADES v2.8:
 * - 🆕 Botão "Baixar PDF" para gerar roteiro de perguntas em PDF
 * - 🆕 PDF formatado com nome do candidato, vaga e espaço para anotações
 * - ✅ Suporte a arquivos .webm (áudio apenas) para upload
 * - 🔧 CORREÇÃO: Perguntas geradas agora são SALVAS no Supabase
 *   para persistência entre sessões (tabela analise_adequacao)
 * 
 * Data: 28/01/2026
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import {
  Mic, Upload, FileAudio, Play, Pause, CheckCircle, XCircle,
  Loader2, AlertTriangle, Brain, MessageSquare, Target,
  ChevronRight, ChevronDown, User, Briefcase, Clock,
  ThumbsUp, ThumbsDown, HelpCircle, FileText, Trash2,
  RefreshCw, Download, BarChart3, Award, TrendingUp,
  Volume2, Headphones, Send, Save, Eye, FileDown
} from 'lucide-react';
import { Candidatura, Vaga } from '@/types';
// jsPDF removido - agora usa API backend para gerar DOCX com papel timbrado TechFor
import EntrevistaComportamental from './EntrevistaComportamental';

// ============================================
// TIPOS
// ============================================

interface EntrevistaRegistro {
  id: number;
  candidatura_id: number;
  analise_adequacao_id?: number;
  status: 'pendente' | 'em_andamento' | 'transcrevendo' | 'analisando' | 'concluida' | 'erro';
  audio_url?: string;
  audio_duracao_segundos?: number;
  transcricao_texto?: string;
  score_tecnico?: number;
  score_comunicacao?: number;
  score_geral?: number;
  recomendacao_ia?: 'APROVAR' | 'REPROVAR' | 'REAVALIAR';
  justificativa_ia?: string;
  decisao_analista?: string;
  created_at: string;
}

interface PerguntaEntrevista {
  categoria: string;
  icone: string;
  perguntas: {
    pergunta: string;
    objetivo: string;
    o_que_avaliar: string[];
    red_flags: string[];
  }[];
}

interface AnaliseResposta {
  pergunta_relacionada: string;
  resposta_extraida: string;
  qualidade: 'excelente' | 'boa' | 'regular' | 'fraca' | 'nao_respondeu';
  score: number;
  observacao: string;
}

interface ResultadoAnalise {
  resumo: string;
  pontos_fortes: string[];
  pontos_atencao: string[];
  red_flags: string[];
  respostas_identificadas: AnaliseResposta[];
  score_tecnico: number;
  score_comunicacao: number;
  score_geral: number;
  recomendacao: 'APROVAR' | 'REPROVAR' | 'REAVALIAR';
  justificativa: string;
}

interface CandidaturaComVaga extends Candidatura {
  vaga?: Vaga;
  pessoa?: {
    id: number;
    nome: string;
  };
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

interface EntrevistaTecnicaInteligenteProps {
  candidaturas: Candidatura[];
  vagas: Vaga[];
  currentUserId?: number;
  onEntrevistaCompleta?: (candidaturaId: number, resultado: 'aprovado' | 'reprovado') => void;
}

const EntrevistaTecnicaInteligente: React.FC<EntrevistaTecnicaInteligenteProps> = ({
  candidaturas = [],
  vagas = [],
  currentUserId = 1,
  onEntrevistaCompleta
}) => {
  // ============================================
  // ESTADOS
  // ============================================
  
  // 🆕 v3.0: Aba ativa (Comportamental / Técnica)
  const [abaAtiva, setAbaAtiva] = useState<'comportamental' | 'tecnica'>('comportamental');
  
  // Seleção
  const [selectedCandidaturaId, setSelectedCandidaturaId] = useState<number | null>(null);
  const [candidaturasComVaga, setCandidaturasComVaga] = useState<CandidaturaComVaga[]>([]);
  
  // Etapas
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  
  // Perguntas
  const [perguntas, setPerguntas] = useState<PerguntaEntrevista[]>([]);
  const [loadingPerguntas, setLoadingPerguntas] = useState(false);
  
  // Áudio
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  
  // 🆕 Modo de entrada: áudio ou respostas escritas
  const [modoEntrada, setModoEntrada] = useState<'audio' | 'texto'>('audio');
  const [textoRespostas, setTextoRespostas] = useState<string>('');
  const [arquivoTexto, setArquivoTexto] = useState<File | null>(null);
  const [extraindoTexto, setExtraindoTexto] = useState(false);
  const [deteccaoIA, setDeteccaoIA] = useState<{ probabilidade: number; evidencias: string[]; veredicto: string } | null>(null);
  
  // Processamento
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>(''); // Mensagem de progresso detalhada
  
  // Resultados
  const [transcricao, setTranscricao] = useState<string>('');
  const [analiseResultado, setAnaliseResultado] = useState<ResultadoAnalise | null>(null);
  const [entrevistaId, setEntrevistaId] = useState<number | null>(null);
  
  // Decisão
  const [decisaoAnalista, setDecisaoAnalista] = useState<'APROVADO' | 'REPROVADO' | 'PENDENTE' | null>(null);
  const [observacoesAnalista, setObservacoesAnalista] = useState('');
  const [salvando, setSalvando] = useState(false);

  // ============================================
  // DADOS DERIVADOS
  // ============================================
  
  const candidaturaAtual = useMemo(() => 
    candidaturasComVaga.find(c => c.id === String(selectedCandidaturaId)),
    [candidaturasComVaga, selectedCandidaturaId]
  );

  const vagaAtual = useMemo(() => 
    vagas.find(v => String(v.id) === String(candidaturaAtual?.vaga_id)),
    [vagas, candidaturaAtual]
  );

  // Filtrar candidaturas elegíveis (em fase de entrevista)
  // 🔧 v2.9.2 (28/01/2026): CORREÇÃO - Usar String() para comparação de tipos
  const candidaturasElegiveis = useMemo(() => {
    console.log('🔍 [Entrevista] Filtrando candidaturas para analista:', currentUserId);
    console.log('🔍 [Entrevista] Total de candidaturas recebidas:', candidaturasComVaga.length);
    
    const filtradas = candidaturasComVaga.filter(c => {
      // 1. Filtrar apenas candidaturas do analista logado
      // 🔧 v2.9.2: Usar String() para evitar problemas de tipo (number vs string)
      const candidaturaAny = c as any;
      const analistaIdCandidatura = String(candidaturaAny.analista_id || '');
      const analistaLogado = String(currentUserId || '');
      
      const isMinhasCandidaturas = analistaIdCandidatura === analistaLogado;
      
      // 2. Filtrar por status elegível para entrevista
      const statusElegivel = (
        c.status === 'entrevista' || 
        c.status === 'triagem' || 
        c.status === 'teste_tecnico' ||
        c.status === 'cv_enviado' ||
        c.status === 'aprovado' ||
        c.status === 'aprovado_interno' ||
        c.status === 'enviado_cliente'
      );
      
      return isMinhasCandidaturas && statusElegivel;
    });
    
    console.log('✅ [Entrevista] Candidaturas filtradas:', filtradas.length);
    return filtradas;
  },
    [candidaturasComVaga, currentUserId]
  );

  // ============================================
  // CARREGAR DADOS INICIAIS
  // ============================================
  
  useEffect(() => {
    // Enriquecer candidaturas com dados da vaga
    // Usar String() para garantir comparação correta de tipos
    const enriched = candidaturas.map(c => {
      const vaga = vagas.find(v => String(v.id) === String(c.vaga_id));
      return { ...c, vaga };
    });
    setCandidaturasComVaga(enriched);
  }, [candidaturas, vagas]);

  // ============================================
  // 🆕 GERAR DOCX DAS PERGUNTAS (v3.0 - com papel timbrado TechFor)
  // ============================================
  
  const [loadingDocx, setLoadingDocx] = useState(false);

  const gerarDocxPerguntas = useCallback(async () => {
    if (!candidaturaAtual || perguntas.length === 0) return;
    
    setLoadingDocx(true);
    setError(null);
    
    try {
      const response = await fetch('/api/entrevista-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidato: {
            nome: candidaturaAtual.candidato_nome || 'Candidato'
          },
          vaga: {
            titulo: vagaAtual?.titulo || 'Vaga não informada',
            codigo: (vagaAtual as any)?.codigo || ''
          },
          perguntas: perguntas,
          data: new Date().toLocaleDateString('pt-BR')
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao gerar DOCX');
      }

      const result = await response.json();

      // Converter base64 para blob e iniciar download
      const byteCharacters = atob(result.docx_base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || `Entrevista_${(candidaturaAtual.candidato_nome || 'Candidato').replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log(`✅ DOCX gerado: ${result.filename} (${result.size} bytes)`);
    } catch (err: any) {
      console.error('❌ Erro ao gerar DOCX:', err);
      setError(err.message || 'Erro ao gerar documento DOCX');
    } finally {
      setLoadingDocx(false);
    }
  }, [candidaturaAtual, vagaAtual, perguntas]);

  // ============================================
  // BUSCAR PERGUNTAS DA ANÁLISE DE ADEQUAÇÃO
  // ============================================
  
  const buscarPerguntas = useCallback(async () => {
    if (!candidaturaAtual) return;
    
    setLoadingPerguntas(true);
    setError(null);
    
    try {
      // Buscar análise de adequação existente
      const { data: analise, error: analiseError } = await supabase
        .from('analise_adequacao')
        .select('perguntas_entrevista, score_geral, recomendacao')
        .eq('candidatura_id', parseInt(candidaturaAtual.id))
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!analiseError && analise?.perguntas_entrevista) {
        console.log('✅ Perguntas encontradas da análise de adequação');
        setPerguntas(analise.perguntas_entrevista);
        return;
      }

      // Se não houver, buscar por pessoa+vaga
      if (candidaturaAtual.pessoa_id && candidaturaAtual.vaga_id) {
        const { data: analise2 } = await supabase
          .from('analise_adequacao')
          .select('perguntas_entrevista')
          .eq('pessoa_id', candidaturaAtual.pessoa_id)
          .eq('vaga_id', parseInt(candidaturaAtual.vaga_id))
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (analise2?.perguntas_entrevista) {
          console.log('✅ Perguntas encontradas por pessoa+vaga');
          setPerguntas(analise2.perguntas_entrevista);
          return;
        }
      }

      // Se não houver perguntas, gerar novas via IA
      console.log('ℹ️ Nenhuma análise encontrada, gerando perguntas padrão...');
      await gerarPerguntasPadrao();

    } catch (err: any) {
      console.error('Erro ao buscar perguntas:', err);
      setError('Erro ao carregar perguntas. Gerando perguntas padrão...');
      await gerarPerguntasPadrao();
    } finally {
      setLoadingPerguntas(false);
    }
  }, [candidaturaAtual]);

  // Gerar perguntas PERSONALIZADAS quando não há análise prévia
  // Busca dados do candidato e da vaga para criar perguntas específicas
  const gerarPerguntasPadrao = async () => {
    if (!vagaAtual || !candidaturaAtual) {
      setPerguntas([{
        categoria: 'Geral',
        icone: '💼',
        perguntas: [{
          pergunta: 'Conte sobre sua experiência profissional mais relevante.',
          objetivo: 'Avaliar experiência geral',
          o_que_avaliar: ['Clareza', 'Relevância'],
          red_flags: ['Respostas vagas']
        }]
      }]);
      return;
    }

    try {
      // 1. Buscar dados completos da pessoa/candidato
      let dadosCandidato: any = {
        nome: candidaturaAtual.candidato_nome || 'Candidato'
      };

      if (candidaturaAtual.pessoa_id) {
        console.log(`📋 Buscando dados da pessoa ID: ${candidaturaAtual.pessoa_id}...`);
        const { data: pessoa, error: pessoaError } = await supabase
          .from('pessoas')
          .select('nome, titulo_profissional, senioridade, resumo_profissional, cv_texto_original')
          .eq('id', candidaturaAtual.pessoa_id)
          .single();

        if (!pessoaError && pessoa) {
          // ✅ FIX v5.1: Fallback para curriculo_texto da candidatura
          // Cenário: candidato entrou via LinkedIn → cv_texto_original = NULL em pessoas
          // Após importar PDF via Análise de CV, o CV pode estar em candidaturas.curriculo_texto
          // Garantir que a Entrevista Inteligente sempre encontre o CV disponível
          let cvTexto = pessoa.cv_texto_original || null;

          if (!cvTexto && candidaturaAtual.curriculo_texto) {
            console.log('ℹ️ cv_texto_original vazio — usando curriculo_texto da candidatura como fallback');
            cvTexto = candidaturaAtual.curriculo_texto;

            // Aproveitar para sincronizar: gravar em pessoas.cv_texto_original se ainda estiver NULL
            try {
              await supabase
                .from('pessoas')
                .update({
                  cv_texto_original: cvTexto.substring(0, 50000),
                  cv_processado: true,
                  updated_at: new Date().toISOString()
                })
                .eq('id', candidaturaAtual.pessoa_id)
                .is('cv_texto_original', null); // Só atualiza se ainda for NULL
              console.log('✅ cv_texto_original sincronizado em pessoas a partir da candidatura');
            } catch (syncErr) {
              console.warn('⚠️ Sincronização de cv_texto_original falhou (não crítico):', syncErr);
            }
          }

          dadosCandidato = {
            nome: pessoa.nome || candidaturaAtual.candidato_nome,
            titulo_profissional: pessoa.titulo_profissional,
            senioridade: pessoa.senioridade,
            resumo_profissional: pessoa.resumo_profissional,
            cv_texto: cvTexto
          };
          console.log(`✅ Dados do candidato carregados: ${dadosCandidato.titulo_profissional || 'Sem título'}, CV: ${cvTexto ? cvTexto.length + ' chars' : 'AUSENTE'}`);
        }
      }

      // 2. Formatar dados da vaga
      const dadosVaga = {
        titulo: vagaAtual.titulo,
        requisitos_obrigatorios: vagaAtual.requisitos_obrigatorios,
        requisitos_desejaveis: vagaAtual.requisitos_desejaveis,
        stack_tecnologica: vagaAtual.stack_tecnologica,
        descricao: vagaAtual.descricao,
        nivel_senioridade: vagaAtual.senioridade
      };

      console.log(`🎯 Gerando perguntas personalizadas para: ${dadosVaga.titulo}`);

      // 3. Chamar API para gerar perguntas personalizadas
      const response = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateInterviewQuestions',
          payload: {
            vaga: dadosVaga,
            candidato: dadosCandidato
          }
        })
      });

      const result = await response.json();
      
      if (result.success && result.data?.perguntas) {
        console.log(`✅ ${result.data.perguntas.length} categorias de perguntas geradas`);
        
        // Mostrar análise prévia se disponível
        if (result.data.analise_previa) {
          console.log('📊 Análise prévia:', result.data.analise_previa);
        }
        
        // 🆕 v2.8: SALVAR PERGUNTAS NO SUPABASE para persistência
        try {
          // Primeiro tenta buscar se já existe
          const { data: existing } = await supabase
            .from('analise_adequacao')
            .select('id')
            .eq('candidatura_id', parseInt(candidaturaAtual.id))
            .limit(1)
            .single();
          
          if (existing?.id) {
            // Atualiza registro existente
            await supabase
              .from('analise_adequacao')
              .update({
                perguntas_entrevista: result.data.perguntas,
                updated_at: new Date().toISOString()
              })
              .eq('id', existing.id);
            console.log('💾 Perguntas atualizadas no registro existente');
          } else {
            // Cria novo registro
            await supabase
              .from('analise_adequacao')
              .insert({
                candidatura_id: parseInt(candidaturaAtual.id),
                pessoa_id: candidaturaAtual.pessoa_id || null,
                vaga_id: parseInt(candidaturaAtual.vaga_id),
                perguntas_entrevista: result.data.perguntas,
                score_geral: result.data.analise_previa?.score_estimado || 0,
                recomendacao: 'AVALIAR',
                status: 'perguntas_geradas'
              });
            console.log('💾 Novo registro de análise criado com perguntas');
          }
        } catch (saveErr) {
          console.warn('⚠️ Erro ao persistir perguntas (não crítico):', saveErr);
        }
        
        setPerguntas(result.data.perguntas);
        return;
      }
      
      // Se falhou, tentar extrair perguntas do resultado
      if (result.data?.perguntas) {
        setPerguntas(result.data.perguntas);
        return;
      }

      throw new Error(result.error || 'Falha ao gerar perguntas');

    } catch (err: any) {
      console.error('❌ Erro ao gerar perguntas personalizadas:', err);
      
      // Fallback: perguntas baseadas na stack da vaga
      // Normalizar stack_tecnologica (pode ser array ou string JSON)
      let stackArray: string[] = [];
      if (Array.isArray(vagaAtual.stack_tecnologica)) {
        stackArray = vagaAtual.stack_tecnologica;
      } else if (typeof vagaAtual.stack_tecnologica === 'string') {
        const trimmed = vagaAtual.stack_tecnologica.trim();
        if (trimmed.startsWith('[')) {
          try {
            stackArray = JSON.parse(trimmed);
          } catch (e) {
            stackArray = [trimmed];
          }
        } else {
          stackArray = [trimmed];
        }
      }
      const stack = stackArray.length > 0 ? stackArray.join(', ') : 'as tecnologias';
      
      const requisitos = Array.isArray(vagaAtual.requisitos_obrigatorios) 
        ? vagaAtual.requisitos_obrigatorios.slice(0, 3).join(', ')
        : vagaAtual.requisitos_obrigatorios || 'os requisitos';

      const perguntasFallback = [{
        categoria: `Validação Técnica - ${vagaAtual.titulo}`,
        icone: '💻',
        perguntas: [
          {
            pergunta: `Descreva em detalhes um projeto onde você utilizou ${stack}. Qual foi seu papel específico e quais decisões técnicas você tomou?`,
            objetivo: 'Validar experiência prática com a stack exigida',
            o_que_avaliar: ['Profundidade técnica', 'Decisões de arquitetura', 'Resultados mensuráveis'],
            red_flags: ['Respostas vagas', 'Não cita tecnologias específicas', 'Não menciona desafios']
          },
          {
            pergunta: `Você mencionou experiência com ${requisitos}. Descreva um desafio complexo que enfrentou e como resolveu tecnicamente.`,
            objetivo: 'Validar profundidade de conhecimento nos requisitos obrigatórios',
            o_que_avaliar: ['Processo de análise', 'Solução implementada', 'Lições aprendidas'],
            red_flags: ['Não detalha o problema', 'Solução superficial', 'Não menciona resultados']
          },
          {
            pergunta: 'Qual foi a arquitetura mais complexa que você desenhou ou contribuiu significativamente? Explique as decisões de design.',
            objetivo: 'Avaliar capacidade de arquitetura e senioridade real',
            o_que_avaliar: ['Visão sistêmica', 'Trade-offs considerados', 'Escalabilidade'],
            red_flags: ['Não sabe explicar decisões', 'Respostas genéricas', 'Confusão conceitual']
          }
        ]
      }];
      
      // 🆕 v2.8: Salvar perguntas de fallback também
      try {
        const { data: existing } = await supabase
          .from('analise_adequacao')
          .select('id')
          .eq('candidatura_id', parseInt(candidaturaAtual.id))
          .limit(1)
          .single();
        
        if (existing?.id) {
          await supabase
            .from('analise_adequacao')
            .update({
              perguntas_entrevista: perguntasFallback,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('analise_adequacao')
            .insert({
              candidatura_id: parseInt(candidaturaAtual.id),
              pessoa_id: candidaturaAtual.pessoa_id || null,
              vaga_id: parseInt(candidaturaAtual.vaga_id),
              perguntas_entrevista: perguntasFallback,
              score_geral: 0,
              recomendacao: 'AVALIAR',
              status: 'perguntas_fallback'
            });
        }
        console.log('💾 Perguntas fallback salvas no Supabase');
      } catch (e) {
        console.warn('⚠️ Erro ao salvar fallback:', e);
      }
      
      setPerguntas(perguntasFallback);
    }
  };

  // Carregar perguntas quando seleciona candidatura
  useEffect(() => {
    if (selectedCandidaturaId && currentStep === 2) {
      buscarPerguntas();
    }
  }, [selectedCandidaturaId, currentStep, buscarPerguntas]);

  // ============================================
  // HANDLERS DE ÁUDIO
  // ============================================
  
  // Limite de 100MB (API com FormData suporta arquivos maiores)
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar formato
    const validFormats = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/webm', 'audio/ogg', 'audio/x-m4a'];
    if (!validFormats.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|webm|ogg)$/i)) {
      setError('Formato não suportado. Use MP3, WAV, M4A, WebM ou OGG.');
      return;
    }

    // Validar tamanho (máx 100MB)
    if (file.size > MAX_FILE_SIZE) {
      setError(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(0)}MB). Máximo permitido: 100MB.`);
      return;
    }

    console.log(`📁 Arquivo selecionado: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

    setAudioFile(file);
    setError(null);

    // Criar URL para preview
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    // Obter duração
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setAudioDuration(audio.duration);
    };
  };

  const handleRemoveAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioFile(null);
    setAudioUrl(null);
    setAudioDuration(0);
  };

  // 🆕 Handler para arquivo de respostas (TXT/DOCX)
  const handleTextoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'docx', 'doc'].includes(ext || '')) {
      setError('Formato não suportado. Use TXT ou DOCX.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 5MB.');
      return;
    }

    setArquivoTexto(file);
    setError(null);

    try {
      if (ext === 'txt') {
        const texto = await file.text();
        setTextoRespostas(texto);
      } else {
        // DOCX - enviar como base64 para Gemini extrair texto
        setExtraindoTexto(true);
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          try {
            const response = await fetch('/api/gemini-analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'extrair_texto_docx',
                payload: { base64Docx: base64 }
              })
            });
            const result = await response.json();
            if (result.success && result.data?.texto) {
              setTextoRespostas(result.data.texto);
              console.log(`✅ Texto extraído do DOCX: ${result.data.texto.length} caracteres`);
            } else {
              setError('Erro ao extrair texto do DOCX. Tente colar o texto manualmente.');
            }
          } catch {
            setError('Erro ao processar DOCX. Tente colar o texto manualmente.');
          } finally {
            setExtraindoTexto(false);
          }
        };
        reader.readAsDataURL(file);
      }
    } catch {
      setError('Erro ao ler arquivo.');
      setExtraindoTexto(false);
    }
  };

  const handleRemoveTexto = () => {
    setArquivoTexto(null);
    setTextoRespostas('');
    setDeteccaoIA(null);
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // ============================================
  // PROCESSAMENTO
  // ============================================
  
  // Função auxiliar para obter MIME type correto
  const getMimeType = (file: File): string => {
    // Mapear extensões para MIME types corretos
    const ext = file.name.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'm4a': 'audio/mp4',
      'webm': 'audio/webm',
      'ogg': 'audio/ogg'
    };
    return mimeMap[ext || ''] || file.type || 'audio/mpeg';
  };

  // ============================================
  // 🆕 PROCESSAR RESPOSTAS ESCRITAS (TEXTO/DOCX)
  // ============================================

  const processarRespostasEscritas = async () => {
    if (!textoRespostas || textoRespostas.trim().length < 50 || !candidaturaAtual) return;

    setError(null);
    setProgress(0);
    setProgressMessage('');

    try {
      setAnalyzing(true);
      setCurrentStep(4);
      setProgress(10);
      setProgressMessage('Preparando análise das respostas escritas...');

      // Formatar perguntas para análise
      const perguntasFlat = perguntas.flatMap(cat => 
        cat.perguntas.map((p: any) => ({
          pergunta: p.pergunta,
          categoria: cat.categoria,
          peso: 1
        }))
      );

      const stackFormatada = Array.isArray(vagaAtual?.stack_tecnologica) 
        ? vagaAtual.stack_tecnologica 
        : vagaAtual?.stack_tecnologica 
          ? [vagaAtual.stack_tecnologica] 
          : [];

      setProgress(30);
      setProgressMessage('Verificando autenticidade e analisando respostas com IA...');

      // Chamar API com action específica para respostas escritas
      const analyzeResponse = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analisar_respostas_escritas',
          payload: {
            respostas_texto: textoRespostas,
            perguntas: perguntasFlat,
            vaga: vagaAtual ? {
              titulo: vagaAtual.titulo,
              requisitos_obrigatorios: vagaAtual.requisitos_obrigatorios,
              stack_tecnologica: stackFormatada
            } : null,
            candidato: {
              nome: candidaturaAtual.candidato_nome
            }
          }
        })
      });

      const analyzeResult = await analyzeResponse.json();

      if (!analyzeResult.success) {
        throw new Error(analyzeResult.error || 'Erro na análise');
      }

      setProgress(80);
      setProgressMessage('Processando resultados...');

      const dados = analyzeResult.data || analyzeResult;

      // Extrair detecção de IA
      if (dados.deteccao_ia) {
        setDeteccaoIA(dados.deteccao_ia);
      }

      // Montar resultado no formato padrão (ResultadoAnalise)
      const resultadoFormatado: ResultadoAnalise = {
        resumo: dados.resumo || '',
        pontos_fortes: dados.pontos_fortes || [],
        pontos_atencao: dados.pontos_atencao || [],
        red_flags: dados.red_flags || [],
        respostas_identificadas: dados.respostas_identificadas || [],
        score_tecnico: dados.score_tecnico || 0,
        score_comunicacao: dados.score_comunicacao || 0,
        score_geral: dados.score_geral || 0,
        recomendacao: dados.recomendacao || 'REAVALIAR',
        justificativa: dados.justificativa || ''
      };

      // Se IA detectada com alta probabilidade, sobrescrever recomendação
      if (dados.deteccao_ia?.probabilidade >= 75) {
        resultadoFormatado.recomendacao = 'REPROVAR';
        resultadoFormatado.red_flags = [
          `⚠️ DETECÇÃO DE IA (${dados.deteccao_ia.probabilidade}%): ${dados.deteccao_ia.veredicto}`,
          ...resultadoFormatado.red_flags
        ];
      }

      setAnaliseResultado(resultadoFormatado);
      setTranscricao(textoRespostas);
      setProgress(100);
      setProgressMessage('Análise concluída!');
      setAnalyzing(false);

      // Salvar no banco
      try {
        const { data: entrevista, error: dbError } = await supabase
          .from('entrevista_tecnica')
          .insert({
            candidatura_id: parseInt(candidaturaAtual.id),
            status: 'concluida',
            transcricao_texto: textoRespostas,
            transcricao_confianca: 100,
            fonte_respostas: 'texto_escrito',
            score_tecnico: resultadoFormatado.score_tecnico,
            score_comunicacao: resultadoFormatado.score_comunicacao,
            score_geral: resultadoFormatado.score_geral,
            recomendacao_ia: resultadoFormatado.recomendacao,
            justificativa_ia: resultadoFormatado.justificativa,
            deteccao_ia: dados.deteccao_ia || null,
            entrevistador_id: currentUserId
          })
          .select('id')
          .single();

        if (dbError) {
          console.error('❌ Erro ao salvar entrevista no banco:', dbError);
        } else if (entrevista?.id) {
          setEntrevistaId(entrevista.id);
          console.log(`✅ Entrevista salva com id: ${entrevista.id}`);
        }
      } catch (dbErr) {
        console.warn('Aviso: erro ao salvar entrevista no banco:', dbErr);
      }

      setCurrentStep(5);

    } catch (err: any) {
      console.error('Erro no processamento de texto:', err);
      setError(err.message || 'Erro ao processar respostas escritas');
      setProgressMessage('');
      setAnalyzing(false);
    }
  };

  const processarEntrevista = async () => {
    // 🆕 Desviar para processamento de texto se modo for texto
    if (modoEntrada === 'texto') {
      return processarRespostasEscritas();
    }
    if (!audioFile || !candidaturaAtual) return;

    setError(null);
    setProgress(0);
    setProgressMessage('');

    try {
      // 1. Obter Signed URL para upload direto ao Supabase
      setUploading(true);
      setProgressMessage('Preparando upload...');
      setProgress(5);

      const ext = audioFile.name.split('.').pop() || 'mp3';
      const mimeType = getMimeType(audioFile);

      console.log(`📤 Iniciando upload: ${audioFile.name} (${(audioFile.size / 1024 / 1024).toFixed(2)}MB)`);

      // Obter signed URL do backend
      const signedUrlResponse = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getSignedUrl',
          filename: audioFile.name,
          vagaId: candidaturaAtual.vaga_id,
          candidaturaId: candidaturaAtual.id,
          contentType: mimeType
        })
      });

      const signedUrlResult = await signedUrlResponse.json();

      if (!signedUrlResult.success) {
        throw new Error(signedUrlResult.error || 'Erro ao obter URL de upload');
      }

      setProgress(10);
      setProgressMessage('Enviando áudio para o servidor...');

      // 2. Upload direto para Supabase usando Signed URL
      console.log(`🔗 Fazendo upload via signed URL...`);
      
      const uploadResponse = await fetch(signedUrlResult.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType
        },
        body: audioFile
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Erro no upload: ${uploadResponse.status} - ${errorText}`);
      }

      const audioPublicUrl = signedUrlResult.publicUrl;
      console.log(`✅ Upload concluído! URL: ${audioPublicUrl}`);

      setProgress(25);
      setProgressMessage('Upload concluído!');

      // 3. Criar registro da entrevista
      setProgressMessage('Registrando entrevista...');
      const { data: entrevista, error: entrevistaError } = await supabase
        .from('entrevista_tecnica')
        .insert({
          candidatura_id: parseInt(candidaturaAtual.id),
          status: 'transcrevendo',
          audio_url: audioPublicUrl,
          audio_duracao_segundos: Math.round(audioDuration),
          audio_tamanho_bytes: audioFile.size,
          audio_formato: ext,
          entrevistador_id: currentUserId
        })
        .select('id')
        .single();

      if (entrevistaError) {
        console.error('Erro ao criar entrevista:', entrevistaError);
        // Continuar mesmo com erro (tabela pode não existir ainda)
      } else {
        setEntrevistaId(entrevista?.id);
      }

      setProgress(30);
      setUploading(false);

      // 4. TRANSCRIÇÃO via URL (Gemini File API - suporta até 2GB!)
      setTranscribing(true);
      setProgressMessage('Transcrevendo áudio com IA (pode levar alguns minutos)...');
      
      console.log(`🎙️ Iniciando transcrição via URL. MIME: ${mimeType}`);

      const transcribeResponse = await fetch('/api/gemini-audio-transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transcribe_url',
          audioUrl: audioPublicUrl,
          audioMimeType: mimeType
        })
      });

      const transcribeResult = await transcribeResponse.json();

      if (!transcribeResult.success || !transcribeResult.transcricao) {
        throw new Error(transcribeResult.error || 'Erro na transcrição');
      }

      const transcricaoCompleta = transcribeResult.transcricao;
      setTranscricao(transcricaoCompleta);
      setProgress(70);
      setTranscribing(false);
      setProgressMessage('Transcrição concluída!');

      console.log(`✅ Transcrição: ${transcricaoCompleta.length} caracteres`);

      // Atualizar registro com transcrição
      if (entrevista?.id) {
        await supabase
          .from('entrevista_tecnica')
          .update({
            status: 'analisando',
            transcricao_texto: transcricaoCompleta,
            transcricao_confianca: transcribeResult.confianca || 90
          })
          .eq('id', entrevista.id);
      }

      // 5. Análise
      setAnalyzing(true);
      setProgressMessage('Analisando respostas com IA...');
      setProgress(80);

      // Formatar perguntas para análise
      const perguntasFlat = perguntas.flatMap(cat => 
        cat.perguntas.map((p: any) => ({
          pergunta: p.pergunta,
          categoria: cat.categoria,
          peso: 1
        }))
      );

      // Formatar stack_tecnologica de forma segura
      const stackFormatada = Array.isArray(vagaAtual?.stack_tecnologica) 
        ? vagaAtual.stack_tecnologica 
        : vagaAtual?.stack_tecnologica 
          ? [vagaAtual.stack_tecnologica] 
          : [];

      const analyzeResponse = await fetch('/api/gemini-audio-transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          transcricao: transcricaoCompleta,
          perguntas: perguntasFlat,
          vaga: vagaAtual ? {
            titulo: vagaAtual.titulo,
            requisitos_obrigatorios: vagaAtual.requisitos_obrigatorios,
            stack_tecnologica: stackFormatada
          } : null,
          candidato: {
            nome: candidaturaAtual.candidato_nome
          }
        })
      });

      const analyzeResult = await analyzeResponse.json();

      if (!analyzeResult.success) {
        throw new Error(analyzeResult.error || 'Erro na análise');
      }

      setAnaliseResultado(analyzeResult);
      setProgress(100);
      setProgressMessage('Análise concluída!');
      setAnalyzing(false);

      // Atualizar registro com análise
      if (entrevista?.id) {
        await supabase
          .from('entrevista_tecnica')
          .update({
            status: 'concluida',
            analise_respostas: analyzeResult.respostas_identificadas,
            pontos_fortes: analyzeResult.pontos_fortes,
            pontos_atencao: analyzeResult.pontos_atencao,
            red_flags: analyzeResult.red_flags,
            score_tecnico: analyzeResult.score_tecnico,
            score_comunicacao: analyzeResult.score_comunicacao,
            score_geral: analyzeResult.score_geral,
            recomendacao_ia: analyzeResult.recomendacao,
            justificativa_ia: analyzeResult.justificativa
          })
          .eq('id', entrevista.id);
      }

      // Avançar para resultados
      setCurrentStep(5);

    } catch (err: any) {
      console.error('Erro no processamento:', err);
      setError(err.message || 'Erro ao processar entrevista');
      setProgressMessage('');
      setUploading(false);
      setTranscribing(false);
      setAnalyzing(false);
    }
  };

  // ============================================
  // SALVAR DECISÃO
  // 🔧 CORREÇÃO v2.9 (19/01/2025): Agora atualiza o status da candidatura
  // ============================================
  
  const salvarDecisao = async () => {
    if (!decisaoAnalista || !selectedCandidaturaId) return;

    setSalvando(true);
    try {
      let entrevistaIdAtual = entrevistaId;

      // Se não temos entrevistaId (ex: insert anterior falhou), criar registro agora
      if (!entrevistaIdAtual && candidaturaAtual) {
        console.log('⚠️ entrevistaId ausente, criando registro da entrevista...');
        const { data: novaEntrevista, error: insertError } = await supabase
          .from('entrevista_tecnica')
          .insert({
            candidatura_id: parseInt(String(selectedCandidaturaId)),
            status: 'concluida',
            transcricao_texto: transcricao || '',
            transcricao_confianca: modoEntrada === 'texto' ? 100 : 90,
            fonte_respostas: modoEntrada === 'texto' ? 'texto_escrito' : 'audio',
            score_tecnico: analiseResultado?.score_tecnico || 0,
            score_comunicacao: analiseResultado?.score_comunicacao || 0,
            score_geral: analiseResultado?.score_geral || 0,
            recomendacao_ia: analiseResultado?.recomendacao || 'REAVALIAR',
            justificativa_ia: analiseResultado?.justificativa || '',
            deteccao_ia: deteccaoIA || null,
            entrevistador_id: currentUserId
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('❌ Erro ao criar registro da entrevista:', insertError);
        } else if (novaEntrevista?.id) {
          entrevistaIdAtual = novaEntrevista.id;
          setEntrevistaId(novaEntrevista.id);
          console.log(`✅ Entrevista criada com id: ${novaEntrevista.id}`);
        }
      }

      // 1. Atualizar registro da entrevista com a decisão do analista
      if (entrevistaIdAtual) {
        await supabase
          .from('entrevista_tecnica')
          .update({
            decisao_analista: decisaoAnalista,
            observacoes_analista: observacoesAnalista,
            decidido_em: new Date().toISOString(),
            decidido_por: currentUserId
          })
          .eq('id', entrevistaIdAtual);
      }

      // =====================================================
      // 🆕 CORREÇÃO: ATUALIZAR STATUS DA CANDIDATURA
      // Isso permite que o candidato avance no fluxo:
      // - Aprovado → pode gerar CV, enviar ao cliente
      // - Reprovado → finaliza o processo interno
      // =====================================================
      const novoStatusCandidatura = decisaoAnalista === 'APROVADO' 
        ? 'aprovado'           // Permite gerar CV, mudar status, enviar ao cliente
        : 'reprovado_interno'; // Reprovado na entrevista técnica

      const { error: candidaturaError } = await supabase
        .from('candidaturas')
        .update({ 
          status: novoStatusCandidatura,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', selectedCandidaturaId);

      if (candidaturaError) {
        console.error('Erro ao atualizar candidatura:', candidaturaError);
      } else {
        console.log(`✅ Candidatura ${selectedCandidaturaId} atualizada para: ${novoStatusCandidatura}`);
      }
      // =====================================================

      // Callback opcional
      if (onEntrevistaCompleta && candidaturaAtual) {
        onEntrevistaCompleta(
          parseInt(candidaturaAtual.id),
          decisaoAnalista === 'APROVADO' ? 'aprovado' : 'reprovado'
        );
      }

      alert(`✅ Decisão salva com sucesso!\n\nCandidatura atualizada para: ${novoStatusCandidatura === 'aprovado' ? 'APROVADO' : 'REPROVADO INTERNO'}`);
      
      // Resetar para nova entrevista
      resetar();

    } catch (err: any) {
      console.error('Erro ao salvar decisão:', err);
      setError('Erro ao salvar decisão');
    } finally {
      setSalvando(false);
    }
  };

  // ============================================
  // HELPERS
  // ============================================
  
  const resetar = () => {
    setSelectedCandidaturaId(null);
    setCurrentStep(1);
    setPerguntas([]);
    handleRemoveAudio();
    setTranscricao('');
    setAnaliseResultado(null);
    setEntrevistaId(null);
    setDecisaoAnalista(null);
    setObservacoesAnalista('');
    setError(null);
    setProgress(0);
    setProgressMessage('');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ============================================
  // RENDER - STEP 1: SELECIONAR CANDIDATURA
  // ============================================
  
  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 flex items-center gap-2 mb-2">
          <FileText size={20} />
          Como funciona:
        </h3>
        <ol className="text-sm text-blue-700 space-y-1 ml-6 list-decimal">
          <li>Selecione a candidatura para entrevista</li>
          <li>Revise as perguntas técnicas personalizadas</li>
          <li>Conduza a entrevista e grave o áudio</li>
          <li>Faça upload da gravação</li>
          <li>A IA transcreve e analisa as respostas automaticamente</li>
          <li>Revise o resultado e tome sua decisão</li>
        </ol>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Selecione a Candidatura para Entrevista:
        </label>
        <select
          value={selectedCandidaturaId || ''}
          onChange={(e) => setSelectedCandidaturaId(e.target.value ? parseInt(e.target.value) : null)}
          className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Selecione uma candidatura --</option>
          {candidaturasElegiveis.map(c => (
            <option key={c.id} value={c.id}>
              {c.candidato_nome} - {c.vaga?.titulo || 'Vaga não identificada'} ({c.status})
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {candidaturasElegiveis.length} candidatura(s) elegível(is) para entrevista
        </p>
      </div>

      <button
        onClick={() => setCurrentStep(2)}
        disabled={!selectedCandidaturaId}
        className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                   disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        Iniciar Entrevista <ChevronRight size={20} />
      </button>
    </div>
  );

  // ============================================
  // RENDER - STEP 2: PERGUNTAS
  // ============================================
  
  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Header com info da candidatura */}
      <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">{candidaturaAtual?.candidato_nome}</p>
          <p className="text-sm text-gray-600">{vagaAtual?.titulo}</p>
        </div>
        <button
          onClick={() => setCurrentStep(1)}
          className="text-sm text-blue-600 hover:underline"
        >
          Trocar candidatura
        </button>
      </div>

      {/* Perguntas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <MessageSquare size={20} className="text-purple-600" />
            Perguntas para Entrevista
            {loadingPerguntas && <Loader2 size={16} className="animate-spin text-gray-400" />}
          </h3>
          
          {/* 🆕 v3.0: Botão Baixar DOCX (com papel timbrado TechFor) */}
          {perguntas.length > 0 && (
            <button
              onClick={gerarDocxPerguntas}
              disabled={loadingDocx}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 
                         rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50"
              title="Baixar roteiro de perguntas em DOCX (Word) com papel timbrado TechFor"
            >
              <FileDown size={16} />
              {loadingDocx ? 'Gerando...' : 'Baixar DOCX'}
            </button>
          )}
        </div>

        {perguntas.length === 0 && !loadingPerguntas ? (
          <p className="text-gray-500 text-center py-8">
            Nenhuma pergunta carregada. Clique em "Atualizar Perguntas" abaixo.
          </p>
        ) : (
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {perguntas.map((categoria, catIdx) => (
              <div key={catIdx} className="border rounded-lg overflow-hidden">
                <div className={`px-4 py-2 font-medium flex items-center gap-2 ${
                  categoria.categoria?.includes('GAP') ? 'bg-amber-100 text-amber-800' : 'bg-gray-100'
                }`}>
                  <span>{categoria.icone}</span>
                  {categoria.categoria}
                </div>
                <div className="divide-y">
                  {categoria.perguntas.map((p: any, pIdx: number) => (
                    <div key={pIdx} className="p-4 hover:bg-gray-50">
                      <p className="font-medium text-gray-900 mb-3">
                        {catIdx + 1}.{pIdx + 1}. {p.pergunta}
                      </p>
                      <div className="text-xs space-y-2">
                        {p.requisito_validado && (
                          <p className="text-blue-600">
                            <span className="font-semibold">🎯 Requisito:</span> {p.requisito_validado}
                          </p>
                        )}
                        <p className="text-gray-600">
                          <span className="font-semibold">Objetivo:</span> {p.objetivo}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-semibold">✅ Avaliar:</span> {Array.isArray(p.o_que_avaliar) ? p.o_que_avaliar.join(' • ') : p.o_que_avaliar}
                        </p>
                        {p.resposta_esperada_nivel_senior && (
                          <details className="text-green-700 bg-green-50 rounded p-2">
                            <summary className="cursor-pointer font-semibold">
                              💡 Resposta esperada (Senior)
                            </summary>
                            <p className="mt-1 text-xs">{p.resposta_esperada_nivel_senior}</p>
                          </details>
                        )}
                        {p.red_flags && p.red_flags.length > 0 && (
                          <p className="text-red-600 bg-red-50 rounded p-2">
                            <span className="font-semibold">⚠️ Red Flags:</span> {Array.isArray(p.red_flags) ? p.red_flags.join(' • ') : p.red_flags}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={buscarPerguntas}
          disabled={loadingPerguntas}
          className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 
                     flex items-center justify-center gap-2"
        >
          <RefreshCw size={18} className={loadingPerguntas ? 'animate-spin' : ''} />
          {loadingPerguntas ? 'Carregando...' : 'Atualizar Perguntas'}
        </button>
        <button
          onClick={() => setCurrentStep(3)}
          disabled={perguntas.length === 0}
          className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                     disabled:bg-gray-300 flex items-center justify-center gap-2"
        >
          Próximo: Upload de Arquivos <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );

  // ============================================
  // RENDER - STEP 3: UPLOAD ÁUDIO OU RESPOSTAS ESCRITAS
  // ============================================
  
  const renderStep3 = () => {
    return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="font-semibold">{candidaturaAtual?.candidato_nome}</p>
        <p className="text-sm text-gray-600">{vagaAtual?.titulo}</p>
      </div>

      {/* 🆕 Toggle: Áudio ou Respostas Escritas */}
      <div className="flex bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setModoEntrada('audio')}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            modoEntrada === 'audio' 
              ? 'bg-white text-blue-700 shadow-sm' 
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Mic size={16} />
          Upload de Áudio
        </button>
        <button
          onClick={() => setModoEntrada('texto')}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            modoEntrada === 'texto' 
              ? 'bg-white text-blue-700 shadow-sm' 
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <FileText size={16} />
          Respostas Escritas
        </button>
      </div>

      {/* ==================== MODO ÁUDIO ==================== */}
      {modoEntrada === 'audio' && (
        <>
          {/* Instruções Áudio */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2">📋 Antes de enviar:</h4>
            <ul className="text-sm text-yellow-700 space-y-1 list-disc ml-4">
              <li>Conduza a entrevista usando as perguntas do passo anterior</li>
              <li>Grave toda a conversa em áudio (MP3, WAV, M4A, WebM ou OGG)</li>
              <li>O áudio deve ter boa qualidade para transcrição</li>
              <li><strong>Tamanho máximo: 100MB</strong> (entrevistas de até ~1 hora)</li>
            </ul>
            <p className="text-xs text-yellow-600 mt-2 italic">
              💡 Powered by Gemini File API - processamento direto sem necessidade de divisão
            </p>
          </div>

          {/* Upload Area */}
          {!audioFile ? (
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed 
                              border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload size={40} className="text-gray-400 mb-3" />
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">Clique para enviar</span> ou arraste o arquivo
                </p>
                <p className="text-xs text-gray-500">MP3, WAV, M4A, WebM, OGG (máx. 100MB)</p>
              </div>
              <input 
                type="file" 
                className="hidden" 
                accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg"
                onChange={handleAudioSelect}
              />
            </label>
          ) : (
            <div className="border rounded-lg p-4 space-y-4">
              {/* Player */}
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlayPause}
                  className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700"
                >
                  {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>
                <div className="flex-1">
                  <p className="font-medium truncate">{audioFile.name}</p>
                  <p className="text-sm text-gray-500">
                    {formatDuration(audioDuration)} • {(audioFile.size / 1024 / 1024).toFixed(1)}MB
                  </p>
                </div>
                <button
                  onClick={handleRemoveAudio}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 size={20} />
                </button>
              </div>
              
              <audio 
                ref={audioRef} 
                src={audioUrl || undefined} 
                onEnded={() => setIsPlaying(false)}
                className="w-full"
                controls
              />
            </div>
          )}
        </>
      )}

      {/* ==================== MODO TEXTO ==================== */}
      {modoEntrada === 'texto' && (
        <>
          {/* Instruções Texto */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">📝 Respostas Escritas do Candidato:</h4>
            <ul className="text-sm text-blue-700 space-y-1 list-disc ml-4">
              <li>Faça upload de arquivo <strong>TXT</strong> ou <strong>DOCX</strong> com as respostas</li>
              <li>Ou cole diretamente o texto das respostas no campo abaixo</li>
              <li>A IA irá analisar cada resposta e cruzar com as perguntas geradas</li>
            </ul>
            <div className="mt-3 p-2 bg-orange-50 border border-orange-200 rounded">
              <p className="text-xs text-orange-700 font-medium">
                ⚠️ <strong>Detecção de IA:</strong> O sistema verificará automaticamente se as respostas 
                foram geradas por inteligência artificial (ChatGPT, Gemini, etc). Candidatos que usarem 
                IA para responder receberão recomendação de <strong>Desqualificação</strong>.
              </p>
            </div>
          </div>

          {/* Upload de Arquivo Texto */}
          {!arquivoTexto && !textoRespostas && (
            <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed 
                              border-blue-300 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload size={32} className="text-blue-400 mb-2" />
                <p className="mb-1 text-sm text-gray-500">
                  <span className="font-semibold">Clique para enviar</span> arquivo com respostas
                </p>
                <p className="text-xs text-gray-500">TXT ou DOCX (máx. 5MB)</p>
              </div>
              <input 
                type="file" 
                className="hidden" 
                accept=".txt,.docx,.doc"
                onChange={handleTextoFileSelect}
              />
            </label>
          )}

          {/* Arquivo carregado */}
          {arquivoTexto && (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <FileText size={20} className="text-green-600" />
              <div className="flex-1">
                <p className="font-medium text-sm">{arquivoTexto.name}</p>
                <p className="text-xs text-gray-500">
                  {(arquivoTexto.size / 1024).toFixed(1)} KB
                  {extraindoTexto && <span className="ml-2 text-blue-600">Extraindo texto...</span>}
                  {textoRespostas && <span className="ml-2 text-green-600">✓ {textoRespostas.length} caracteres extraídos</span>}
                </p>
              </div>
              <button onClick={handleRemoveTexto} className="text-red-500 hover:text-red-700 p-1">
                <Trash2 size={16} />
              </button>
            </div>
          )}

          {/* Divisor OU */}
          {!arquivoTexto && !textoRespostas && (
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-gray-200"></div>
              <span className="text-sm text-gray-400 font-medium">OU COLE O TEXTO</span>
              <div className="flex-1 border-t border-gray-200"></div>
            </div>
          )}

          {/* Área de texto para colar respostas */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Respostas do Candidato
              {textoRespostas && (
                <span className="ml-2 text-gray-400 font-normal">({textoRespostas.length} caracteres)</span>
              )}
            </label>
            <textarea
              className="w-full border rounded-lg p-3 text-sm min-h-[200px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder={`Cole aqui as respostas do candidato às perguntas técnicas...\n\nExemplo:\n1. Sobre Vue.js: Na ART IT, enfrentei desafios como...\n2. Sobre MySQL: A query mais complexa que otimizei foi...`}
              value={textoRespostas}
              onChange={e => setTextoRespostas(e.target.value)}
            />
            {textoRespostas && textoRespostas.trim().length < 50 && (
              <p className="text-xs text-orange-600 mt-1">
                Mínimo de 50 caracteres para análise. Atual: {textoRespostas.trim().length}
              </p>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setCurrentStep(2)}
          className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Voltar
        </button>
        <button
          onClick={async () => {
            // Finalizar Entrevista - salvar CV parcial diretamente
            if (!selectedCandidaturaId) return;
            const confirmou = window.confirm('Deseja finalizar a entrevista e salvar o CV parcial?');
            if (!confirmou) return;
            // Troca para aba comportamental para finalizar lá
            setAbaAtiva('comportamental');
          }}
          className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 
                     flex items-center justify-center gap-2"
        >
          ✅ Finalizar Entrevista
        </button>
        <button
          onClick={() => setCurrentStep(4)}
          disabled={modoEntrada === 'audio' ? !audioFile : (!textoRespostas || textoRespostas.trim().length < 50)}
          className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                     disabled:bg-gray-300 flex items-center justify-center gap-2"
        >
          {modoEntrada === 'audio' ? 'Processar Entrevista' : 'Analisar Respostas'} <Brain size={20} />
        </button>
      </div>
    </div>
  );};

  // ============================================
  // RENDER - STEP 4: PROCESSAMENTO
  // ============================================
  
  const renderStep4 = () => (
    <div className="space-y-6">
      {/* Progress */}
      <div className="text-center py-8">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-blue-100 flex items-center justify-center">
          {uploading && <Upload size={40} className="text-blue-600 animate-pulse" />}
          {transcribing && <Headphones size={40} className="text-blue-600 animate-pulse" />}
          {analyzing && <Brain size={40} className="text-blue-600 animate-pulse" />}
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {uploading && 'Enviando áudio...'}
          {transcribing && 'Transcrevendo entrevista...'}
          {analyzing && (modoEntrada === 'texto' ? 'Analisando respostas escritas...' : 'Analisando respostas...')}
          {!uploading && !transcribing && !analyzing && 'Pronto para processar'}
        </h3>

        {/* Mensagem de progresso detalhada */}
        <p className="text-gray-500 mb-4">
          {progressMessage || (
            <>
              {uploading && 'Fazendo upload do arquivo de áudio'}
              {transcribing && 'A IA está convertendo o áudio em texto'}
              {analyzing && (modoEntrada === 'texto' 
                ? 'Verificando autenticidade e analisando respostas' 
                : 'Comparando respostas com as perguntas esperadas'
              )}
            </>
          )}
        </p>

        <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
          <div 
            className="bg-blue-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-500">{progress}% concluído</p>
      </div>

      {/* Etapas */}
      <div className="space-y-3">
        {modoEntrada === 'audio' ? (
          <>
            <StepIndicator 
              done={progress > 20} 
              active={uploading} 
              label="Upload e registro" 
            />
            <StepIndicator 
              done={progress > 65} 
              active={transcribing} 
              label="Transcrição (Gemini File API)"
            />
            <StepIndicator 
              done={progress >= 100} 
              active={analyzing} 
              label="Análise das respostas" 
            />
          </>
        ) : (
          <>
            <StepIndicator 
              done={progress > 20} 
              active={progress <= 20 && analyzing} 
              label="Preparando texto das respostas" 
            />
            <StepIndicator 
              done={progress > 50} 
              active={progress > 20 && progress <= 50 && analyzing} 
              label="Detecção de IA (autenticidade)" 
            />
            <StepIndicator 
              done={progress >= 100} 
              active={progress > 50 && analyzing} 
              label="Análise técnica das respostas" 
            />
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          <p className="font-medium mb-2">Erro no processamento</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setProgress(0);
              setProgressMessage('');
              processarEntrevista();
            }}
            className="mt-3 text-sm text-red-700 underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!uploading && !transcribing && !analyzing && progress === 0 && (
        <button
          onClick={processarEntrevista}
          className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 
                     flex items-center justify-center gap-2"
        >
          <Send size={20} />
          Iniciar Processamento
        </button>
      )}
    </div>
  );

  // ============================================
  // RENDER - STEP 5: RESULTADOS
  // ============================================
  
  const renderStep5 = () => (
    <div className="space-y-6">
      {/* Score Principal */}
      {analiseResultado && (
        <div className={`text-center p-6 rounded-xl ${
          analiseResultado.recomendacao === 'APROVAR' ? 'bg-green-50' :
          analiseResultado.recomendacao === 'REPROVAR' ? 'bg-red-50' :
          'bg-yellow-50'
        }`}>
          <div className={`text-5xl font-bold mb-2 ${
            analiseResultado.recomendacao === 'APROVAR' ? 'text-green-600' :
            analiseResultado.recomendacao === 'REPROVAR' ? 'text-red-600' :
            'text-yellow-600'
          }`}>
            {analiseResultado.score_geral}%
          </div>
          <p className="text-lg font-medium text-gray-700 mb-1">Score Geral</p>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-white ${
            analiseResultado.recomendacao === 'APROVAR' ? 'bg-green-600' :
            analiseResultado.recomendacao === 'REPROVAR' ? 'bg-red-600' :
            'bg-yellow-600'
          }`}>
            {analiseResultado.recomendacao === 'APROVAR' && <ThumbsUp size={18} />}
            {analiseResultado.recomendacao === 'REPROVAR' && <ThumbsDown size={18} />}
            {analiseResultado.recomendacao === 'REAVALIAR' && <HelpCircle size={18} />}
            Recomendação: {analiseResultado.recomendacao}
          </div>
        </div>
      )}

      {/* 🆕 Alerta de Detecção de IA */}
      {deteccaoIA && (
        <div className={`rounded-xl p-5 border-2 ${
          deteccaoIA.probabilidade >= 75 
            ? 'bg-red-50 border-red-300' 
            : deteccaoIA.probabilidade >= 40 
              ? 'bg-orange-50 border-orange-300' 
              : 'bg-green-50 border-green-300'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-full ${
              deteccaoIA.probabilidade >= 75 ? 'bg-red-100' : 
              deteccaoIA.probabilidade >= 40 ? 'bg-orange-100' : 'bg-green-100'
            }`}>
              <Brain size={24} className={
                deteccaoIA.probabilidade >= 75 ? 'text-red-600' : 
                deteccaoIA.probabilidade >= 40 ? 'text-orange-600' : 'text-green-600'
              } />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h4 className={`font-bold text-lg ${
                  deteccaoIA.probabilidade >= 75 ? 'text-red-800' : 
                  deteccaoIA.probabilidade >= 40 ? 'text-orange-800' : 'text-green-800'
                }`}>
                  🤖 Detecção de IA: {deteccaoIA.probabilidade}%
                </h4>
                <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                  deteccaoIA.probabilidade >= 75 
                    ? 'bg-red-200 text-red-800' 
                    : deteccaoIA.probabilidade >= 40 
                      ? 'bg-orange-200 text-orange-800'
                      : 'bg-green-200 text-green-800'
                }`}>
                  {deteccaoIA.probabilidade >= 75 ? '⛔ ALTA PROBABILIDADE' : 
                   deteccaoIA.probabilidade >= 40 ? '⚠️ PROBABILIDADE MODERADA' : 
                   '✅ BAIXA PROBABILIDADE'}
                </span>
              </div>
              
              <p className={`text-sm mb-3 ${
                deteccaoIA.probabilidade >= 75 ? 'text-red-700' : 
                deteccaoIA.probabilidade >= 40 ? 'text-orange-700' : 'text-green-700'
              }`}>
                {deteccaoIA.veredicto}
              </p>

              {deteccaoIA.evidencias?.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800">
                    Ver evidências ({deteccaoIA.evidencias.length})
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {deteccaoIA.evidencias.map((ev: string, i: number) => (
                      <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="mt-1 text-gray-400">•</span>
                        {ev}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {deteccaoIA.probabilidade >= 75 && (
                <div className="mt-3 p-3 bg-red-100 rounded-lg">
                  <p className="text-sm font-bold text-red-800">
                    ⛔ RECOMENDAÇÃO: DESQUALIFICAR CANDIDATO
                  </p>
                  <p className="text-xs text-red-700 mt-1">
                    As respostas apresentam fortes indícios de terem sido geradas por inteligência artificial. 
                    Recomenda-se desqualificar o candidato ou solicitar nova entrevista presencial/por vídeo.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scores Detalhados */}
      {analiseResultado && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{analiseResultado.score_tecnico}%</p>
            <p className="text-sm text-gray-600">Score Técnico</p>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-purple-600">{analiseResultado.score_comunicacao}%</p>
            <p className="text-sm text-gray-600">Comunicação</p>
          </div>
        </div>
      )}

      {/* Resumo */}
      {analiseResultado && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-800 mb-2">📝 Resumo</h4>
          <p className="text-gray-700">{analiseResultado.resumo}</p>
        </div>
      )}

      {/* Pontos Fortes */}
      {analiseResultado?.pontos_fortes?.length > 0 && (
        <div className="bg-green-50 rounded-lg p-4">
          <h4 className="font-medium text-green-800 mb-2 flex items-center gap-2">
            <ThumbsUp size={18} /> Pontos Fortes
          </h4>
          <ul className="space-y-1">
            {analiseResultado.pontos_fortes.map((p, i) => (
              <li key={i} className="text-sm text-green-700">• {p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Red Flags */}
      {analiseResultado?.red_flags?.length > 0 && (
        <div className="bg-red-50 rounded-lg p-4">
          <h4 className="font-medium text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle size={18} /> Red Flags
          </h4>
          <ul className="space-y-1">
            {analiseResultado.red_flags.map((r, i) => (
              <li key={i} className="text-sm text-red-700">• {r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcrição Expansível */}
      <details className="border rounded-lg">
        <summary className="px-4 py-3 cursor-pointer font-medium text-gray-700 hover:bg-gray-50">
          📄 Ver Transcrição Completa
        </summary>
        <div className="px-4 py-3 border-t bg-gray-50 max-h-64 overflow-y-auto">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{transcricao}</p>
        </div>
      </details>

      {/* Decisão do Analista */}
      <div className="border-t pt-6">
        <h4 className="font-semibold text-gray-800 mb-4">🎯 Sua Decisão</h4>
        
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setDecisaoAnalista('APROVADO')}
            className={`flex-1 py-3 rounded-lg border-2 flex items-center justify-center gap-2 transition-colors ${
              decisaoAnalista === 'APROVADO' 
                ? 'bg-green-600 text-white border-green-600' 
                : 'border-green-300 text-green-700 hover:bg-green-50'
            }`}
          >
            <ThumbsUp size={20} /> Aprovar
          </button>
          <button
            onClick={() => setDecisaoAnalista('REPROVADO')}
            className={`flex-1 py-3 rounded-lg border-2 flex items-center justify-center gap-2 transition-colors ${
              decisaoAnalista === 'REPROVADO' 
                ? 'bg-red-600 text-white border-red-600' 
                : 'border-red-300 text-red-700 hover:bg-red-50'
            }`}
          >
            <ThumbsDown size={20} /> Reprovar
          </button>
        </div>

        <textarea
          value={observacoesAnalista}
          onChange={(e) => setObservacoesAnalista(e.target.value)}
          placeholder="Observações adicionais (opcional)..."
          className="w-full p-3 border rounded-lg h-24 resize-none"
        />

        <div className="flex gap-3 mt-4">
          <button
            onClick={resetar}
            className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Nova Entrevista
          </button>
          <button
            onClick={salvarDecisao}
            disabled={!decisaoAnalista || salvando}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                       disabled:bg-gray-300 flex items-center justify-center gap-2"
          >
            {salvando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {salvando ? 'Salvando...' : 'Salvar Decisão'}
          </button>
        </div>
      </div>
    </div>
  );

  // ============================================
  // RENDER PRINCIPAL
  // ============================================
  
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      {/* Título */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="text-purple-600" />
            Entrevista Inteligente
          </h2>
          <p className="text-sm text-gray-500">
            Integrado com Supabase • Powered by Gemini AI
          </p>
        </div>
        
        {/* Steps Indicator - só mostra na aba técnica quando já selecionou candidatura */}
        {abaAtiva === 'tecnica' && selectedCandidaturaId && (
          <div className="flex items-center gap-2">
            {[2, 3, 4, 5].map(step => (
              <div
                key={step}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === currentStep
                    ? 'bg-blue-600 text-white'
                    : step < currentStep
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {step < currentStep ? <CheckCircle size={16} /> : step - 1}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* SELEÇÃO DE CANDIDATURA (COMPARTILHADA) */}
      {/* ============================================ */}
      {!selectedCandidaturaId ? (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 flex items-center gap-2 mb-2">
              <FileText size={20} />
              Selecione o Candidato para Entrevista
            </h3>
            <p className="text-sm text-blue-700">
              A candidatura selecionada será usada tanto na Entrevista Comportamental quanto na Técnica.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Candidatura:
            </label>
            <select
              value=""
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value) : null;
                setSelectedCandidaturaId(val);
                if (val) setCurrentStep(2);
              }}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Selecione uma candidatura --</option>
              {candidaturasElegiveis.map(c => (
                <option key={c.id} value={c.id}>
                  {c.candidato_nome} - {c.vaga?.titulo || 'Vaga não identificada'} ({c.status})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {candidaturasElegiveis.length} candidatura(s) elegível(is) para entrevista
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ============================================ */}
          {/* INFO DO CANDIDATO + BOTÃO TROCAR */}
          {/* ============================================ */}
          <div className="bg-gray-50 rounded-lg p-3 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User size={18} className="text-gray-500" />
              <div>
                <p className="font-semibold text-gray-900 text-sm">{candidaturaAtual?.candidato_nome}</p>
                <p className="text-xs text-gray-500">{vagaAtual?.titulo} ({candidaturaAtual?.status})</p>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedCandidaturaId(null);
                setCurrentStep(1);
                setAbaAtiva('comportamental');
              }}
              className="text-sm text-blue-600 hover:underline"
            >
              Trocar candidatura
            </button>
          </div>

          {/* ============================================ */}
          {/* ABAS: COMPORTAMENTAL / TÉCNICA */}
          {/* ============================================ */}
          <div className="flex border-b mb-6">
            <button
              onClick={() => setAbaAtiva('comportamental')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                abaAtiva === 'comportamental'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📋 Entrevista Comportamental
            </button>
            <button
              onClick={() => setAbaAtiva('tecnica')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                abaAtiva === 'tecnica'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              🧠 Entrevista Técnica Inteligente
            </button>
          </div>

          {/* ============================================ */}
          {/* CONTEÚDO DA ABA ATIVA */}
          {/* ============================================ */}
          {abaAtiva === 'comportamental' ? (
            <EntrevistaComportamental
              candidaturaId={parseInt(String(selectedCandidaturaId))}
              candidatoNome={candidaturaAtual?.candidato_nome || 'Candidato'}
              pessoaId={candidaturaAtual?.pessoa_id ? parseInt(String(candidaturaAtual.pessoa_id)) : undefined}
              vagaInfo={vagaAtual ? {
                id: parseInt(String(vagaAtual.id)),
                titulo: vagaAtual.titulo || '',
                codigo: (vagaAtual as any).codigo,
                cliente: (vagaAtual as any).cliente_nome,
                gestor: (vagaAtual as any).gestor_nome,
                requisitos: vagaAtual.requisitos_obrigatorios as string,
                requisitos_desejaveis: vagaAtual.requisitos_desejaveis as string,
                stack_tecnologica: Array.isArray(vagaAtual.stack_tecnologica) 
                  ? vagaAtual.stack_tecnologica.join(', ') 
                  : vagaAtual.stack_tecnologica as string
              } : undefined}
              currentUserId={currentUserId}
              onEntrevistaFinalizada={(cvId) => {
                console.log('✅ CV parcial salvo, ID:', cvId);
              }}
            />
          ) : (
            <>
              {/* Conteúdo original da Entrevista Técnica (Steps 2-5) */}
              {currentStep === 2 && renderStep2()}
              {currentStep === 3 && renderStep3()}
              {currentStep === 4 && renderStep4()}
              {currentStep === 5 && renderStep5()}
            </>
          )}
        </>
      )}
    </div>
  );
};

// ============================================
// COMPONENTES AUXILIARES
// ============================================

const StepIndicator: React.FC<{ done: boolean; active: boolean; label: string }> = ({ done, active, label }) => (
  <div className={`flex items-center gap-3 p-3 rounded-lg ${
    done ? 'bg-green-50' : active ? 'bg-blue-50' : 'bg-gray-50'
  }`}>
    {done ? (
      <CheckCircle className="text-green-600" size={20} />
    ) : active ? (
      <Loader2 className="text-blue-600 animate-spin" size={20} />
    ) : (
      <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
    )}
    <span className={done ? 'text-green-700' : active ? 'text-blue-700' : 'text-gray-500'}>
      {label}
    </span>
  </div>
);

export default EntrevistaTecnicaInteligente;
