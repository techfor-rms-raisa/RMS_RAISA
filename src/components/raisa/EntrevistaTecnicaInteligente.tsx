/**
 * EntrevistaTecnicaInteligente.tsx - RMS RAISA v2.1
 * Componente de Entrevista Técnica com IA (Upload de Áudio + Transcrição)
 * 
 * 🔧 CORREÇÃO v2.1 (19/01/2025):
 * - Função salvarDecisao agora ATUALIZA O STATUS DA CANDIDATURA
 * - Candidato aprovado → status 'aprovado' (permite gerar CV, mudar status)
 * - Candidato reprovado → status 'reprovado_interno'
 * 
 * INTEGRAÇÃO:
 * - Supabase (entrevista_tecnica, candidaturas)
 * - Gemini File API (transcrição de áudio)
 * - Gemini AI (análise de respostas)
 * 
 * Data: 19/01/2025
 */

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { Candidatura, Vaga } from '@/types';
import { 
  Brain, Mic, Upload, Play, Pause, Send, CheckCircle, 
  XCircle, AlertTriangle, Loader2, FileText, ThumbsUp, 
  ThumbsDown, Save, Trash2
} from 'lucide-react';

// ============================================
// INTERFACES
// ============================================

interface PerguntaEntrevista {
  categoria: string;
  perguntas: Array<{
    pergunta: string;
    objetivo?: string;
    o_que_avaliar?: string[];
  }>;
}

interface ResultadoAnalise {
  success: boolean;
  respostas_identificadas?: any[];
  pontos_fortes?: string[];
  pontos_atencao?: string[];
  red_flags?: string[];
  score_tecnico?: number;
  score_comunicacao?: number;
  score_geral?: number;
  recomendacao?: 'APROVAR' | 'REPROVAR' | 'REAVALIAR';
  justificativa?: string;
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
  
  // Processamento
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>('');
  
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
  const candidaturasElegiveis = useMemo(() => 
    candidaturasComVaga.filter(c => 
      c.status === 'entrevista' || 
      c.status === 'triagem' || 
      c.status === 'teste_tecnico' ||
      c.status === 'cv_enviado'
    ),
    [candidaturasComVaga]
  );

  // ============================================
  // CARREGAR DADOS INICIAIS
  // ============================================
  
  useEffect(() => {
    const enriched = candidaturas.map(c => {
      const vaga = vagas.find(v => String(v.id) === String(c.vaga_id));
      return { ...c, vaga };
    });
    setCandidaturasComVaga(enriched);
  }, [candidaturas, vagas]);

  // ============================================
  // GERAR PERGUNTAS COM IA
  // ============================================
  
  const gerarPerguntas = async () => {
    if (!vagaAtual) return;
    
    setLoadingPerguntas(true);
    setError(null);
    
    try {
      const stackFormatada = Array.isArray(vagaAtual.stack_tecnologica) 
        ? vagaAtual.stack_tecnologica 
        : vagaAtual.stack_tecnologica 
          ? [vagaAtual.stack_tecnologica] 
          : [];

      const response = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'gerar_perguntas_entrevista',
          vaga: {
            titulo: vagaAtual.titulo,
            descricao: vagaAtual.descricao,
            senioridade: vagaAtual.senioridade,
            stack_tecnologica: stackFormatada,
            requisitos_obrigatorios: vagaAtual.requisitos_obrigatorios || []
          }
        })
      });

      const result = await response.json();
      
      if (result.success && result.perguntas) {
        setPerguntas(result.perguntas);
        setCurrentStep(2);
      } else {
        throw new Error(result.error || 'Erro ao gerar perguntas');
      }
    } catch (err: any) {
      console.error('Erro ao gerar perguntas:', err);
      setError(err.message || 'Erro ao gerar perguntas');
    } finally {
      setLoadingPerguntas(false);
    }
  };

  // ============================================
  // MANIPULAÇÃO DE ÁUDIO
  // ============================================
  
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/m4a', 'audio/mp4'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|webm|ogg|m4a)$/i)) {
      setError('Formato não suportado. Use MP3, WAV, WebM, OGG ou M4A.');
      return;
    }

    // Validar tamanho (máximo 100MB para upload, Gemini aceita até 2GB)
    if (file.size > 100 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 100MB.');
      return;
    }

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
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioFile(null);
    setAudioUrl(null);
    setAudioDuration(0);
    setIsPlaying(false);
  };

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // ============================================
  // PROCESSAR ENTREVISTA (Upload + Transcrição + Análise)
  // ============================================
  
  const processarEntrevista = async () => {
    if (!audioFile || !candidaturaAtual || !vagaAtual) return;

    setError(null);
    setProgress(0);
    
    try {
      // 1. Upload do áudio para Supabase Storage
      setUploading(true);
      setProgressMessage('Fazendo upload do áudio...');
      setProgress(10);

      const fileExt = audioFile.name.split('.').pop()?.toLowerCase() || 'mp3';
      const fileName = `entrevista_${candidaturaAtual.id}_${Date.now()}.${fileExt}`;
      const filePath = `entrevistas/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('audio-entrevistas')
        .upload(filePath, audioFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from('audio-entrevistas')
        .getPublicUrl(filePath);

      const audioPublicUrl = urlData.publicUrl;
      setProgress(20);
      setUploading(false);

      // 2. Criar registro da entrevista
      const { data: entrevista, error: entrevistaError } = await supabase
        .from('entrevista_tecnica')
        .insert({
          candidatura_id: parseInt(candidaturaAtual.id),
          vaga_id: parseInt(String(vagaAtual.id)),
          analista_id: currentUserId,
          audio_url: audioPublicUrl,
          audio_duracao_segundos: Math.round(audioDuration),
          perguntas_geradas: perguntas,
          status: 'transcrevendo',
          criado_em: new Date().toISOString()
        })
        .select()
        .single();

      if (entrevistaError) {
        console.error('Erro ao criar registro:', entrevistaError);
      } else {
        setEntrevistaId(entrevista.id);
      }

      // 3. Determinar MIME type
      const mimeTypeMap: Record<string, string> = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'webm': 'audio/webm',
        'ogg': 'audio/ogg',
        'm4a': 'audio/mp4'
      };
      const mimeType = mimeTypeMap[fileExt] || 'audio/mpeg';

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
  // 🔧 CORREÇÃO v2.1: SALVAR DECISÃO + ATUALIZAR CANDIDATURA
  // ============================================
  
  const salvarDecisao = async () => {
    if (!entrevistaId || !decisaoAnalista || !selectedCandidaturaId) return;

    setSalvando(true);
    try {
      // 1. Atualizar registro da entrevista
      const { error: entrevistaError } = await supabase
        .from('entrevista_tecnica')
        .update({
          decisao_analista: decisaoAnalista,
          observacoes_analista: observacoesAnalista,
          decidido_em: new Date().toISOString(),
          decidido_por: currentUserId
        })
        .eq('id', entrevistaId);

      if (entrevistaError) {
        console.error('Erro ao atualizar entrevista:', entrevistaError);
        throw entrevistaError;
      }

      // =====================================================
      // 🆕 CORREÇÃO: ATUALIZAR STATUS DA CANDIDATURA
      // =====================================================
      // Isso permite que o candidato avance no fluxo:
      // - Aprovado → pode gerar CV, enviar ao cliente
      // - Reprovado → finaliza o processo
      // =====================================================
      
      const novoStatusCandidatura = decisaoAnalista === 'APROVADO' 
        ? 'aprovado'           // Permite gerar CV, mudar status, etc.
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
        throw candidaturaError;
      }

      console.log(`✅ Candidatura ${selectedCandidaturaId} atualizada para: ${novoStatusCandidatura}`);

      // 2. Registrar no histórico de status (para rastreabilidade)
      try {
        await supabase
          .from('candidatura_historico_status')
          .insert({
            candidatura_id: selectedCandidaturaId,
            status_anterior: candidaturaAtual?.status || 'entrevista',
            status_novo: novoStatusCandidatura,
            data_mudanca: new Date().toISOString(),
            usuario_id: currentUserId,
            motivo: decisaoAnalista === 'APROVADO' 
              ? 'Aprovado na entrevista técnica com IA'
              : 'Reprovado na entrevista técnica com IA',
            observacao: observacoesAnalista || `Score: ${analiseResultado?.score_geral || 'N/A'}%`
          });
      } catch (histError) {
        // Log mas não falha - histórico é complementar
        console.warn('Aviso: Não foi possível registrar histórico:', histError);
      }

      // 3. Callback opcional para atualizar lista no componente pai
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
      setError(`Erro ao salvar decisão: ${err.message}`);
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
          className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-purple-500"
        >
          <option value="">-- Selecione uma candidatura --</option>
          {candidaturasElegiveis.map(c => {
            const v = vagas.find(vg => String(vg.id) === String(c.vaga_id));
            return (
              <option key={c.id} value={c.id}>
                {c.candidato_nome} - {v?.titulo || 'Vaga não encontrada'} ({c.status})
              </option>
            );
          })}
        </select>

        {candidaturasElegiveis.length === 0 && (
          <p className="text-amber-600 text-sm mt-2">
            ⚠️ Nenhuma candidatura elegível. Status aceitos: triagem, entrevista, teste_tecnico, cv_enviado.
          </p>
        )}
      </div>

      {selectedCandidaturaId && vagaAtual && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-semibold mb-2">📋 Vaga: {vagaAtual.titulo}</h4>
          <p className="text-sm text-gray-600">Candidato: {candidaturaAtual?.candidato_nome}</p>
          <p className="text-sm text-gray-600">Senioridade: {vagaAtual.senioridade}</p>
          {vagaAtual.stack_tecnologica && (
            <p className="text-sm text-gray-600">
              Stack: {Array.isArray(vagaAtual.stack_tecnologica) 
                ? vagaAtual.stack_tecnologica.join(', ') 
                : vagaAtual.stack_tecnologica}
            </p>
          )}
        </div>
      )}

      <button
        onClick={gerarPerguntas}
        disabled={!selectedCandidaturaId || loadingPerguntas}
        className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 
                   disabled:bg-gray-300 flex items-center justify-center gap-2"
      >
        {loadingPerguntas ? (
          <>
            <Loader2 className="animate-spin" size={20} />
            Gerando perguntas...
          </>
        ) : (
          <>
            <Brain size={20} />
            Gerar Perguntas com IA
          </>
        )}
      </button>
    </div>
  );

  // ============================================
  // RENDER - STEP 2: PERGUNTAS GERADAS
  // ============================================
  
  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="font-semibold text-green-800 mb-2">✅ Perguntas Geradas</h3>
        <p className="text-sm text-green-700">
          Revise as perguntas abaixo e conduza a entrevista. Grave o áudio para análise automática.
        </p>
      </div>

      {perguntas.map((cat, catIdx) => (
        <div key={catIdx} className="border rounded-lg p-4">
          <h4 className="font-semibold text-gray-800 mb-3">{cat.categoria}</h4>
          <ul className="space-y-2">
            {cat.perguntas.map((p: any, pIdx: number) => (
              <li key={pIdx} className="text-sm text-gray-700 pl-4 border-l-2 border-purple-300">
                <p className="font-medium">{p.pergunta}</p>
                {p.objetivo && (
                  <p className="text-xs text-gray-500 mt-1">🎯 {p.objetivo}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="flex gap-3">
        <button
          onClick={() => setCurrentStep(1)}
          className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          ← Voltar
        </button>
        <button
          onClick={() => setCurrentStep(3)}
          className="flex-1 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Próximo: Upload do Áudio →
        </button>
      </div>
    </div>
  );

  // ============================================
  // RENDER - STEP 3: UPLOAD DE ÁUDIO
  // ============================================
  
  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 flex items-center gap-2 mb-2">
          <Mic size={20} />
          Upload da Gravação
        </h3>
        <p className="text-sm text-blue-700">
          Faça upload do áudio da entrevista. Formatos: MP3, WAV, WebM, OGG, M4A (máx. 100MB)
        </p>
      </div>

      {!audioFile ? (
        <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed 
                          border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
          <Upload size={40} className="text-gray-400 mb-2" />
          <span className="text-gray-600">Clique para selecionar ou arraste o arquivo</span>
          <span className="text-sm text-gray-400 mt-1">MP3, WAV, WebM, OGG, M4A</span>
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.webm,.ogg,.m4a"
            onChange={handleAudioUpload}
            className="hidden"
          />
        </label>
      ) : (
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium text-gray-800">{audioFile.name}</p>
              <p className="text-sm text-gray-500">
                {(audioFile.size / (1024 * 1024)).toFixed(2)} MB • {formatDuration(audioDuration)}
              </p>
            </div>
            <button
              onClick={handleRemoveAudio}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 size={20} />
            </button>
          </div>
          
          {audioUrl && (
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlayPause}
                className="p-3 bg-purple-100 text-purple-600 rounded-full hover:bg-purple-200"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => setIsPlaying(false)}
                className="flex-1"
                controls
              />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setCurrentStep(2)}
          className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          ← Voltar
        </button>
        <button
          onClick={() => setCurrentStep(4)}
          disabled={!audioFile}
          className="flex-1 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 
                     disabled:bg-gray-300"
        >
          Próximo: Processar →
        </button>
      </div>
    </div>
  );

  // ============================================
  // RENDER - STEP 4: PROCESSAMENTO
  // ============================================
  
  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h3 className="font-semibold text-purple-800 mb-2">🚀 Processamento Automático</h3>
        <p className="text-sm text-purple-700">
          O sistema irá: Upload → Transcrição (Gemini) → Análise das Respostas
        </p>
      </div>

      {/* Barra de Progresso */}
      {progress > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{progressMessage}</span>
            <span className="text-purple-600 font-medium">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-purple-600 h-3 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Indicadores de Status */}
      <div className="space-y-2">
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
            {analiseResultado.recomendacao === 'APROVAR' ? <CheckCircle size={20} /> :
             analiseResultado.recomendacao === 'REPROVAR' ? <XCircle size={20} /> :
             <AlertTriangle size={20} />}
            Recomendação IA: {analiseResultado.recomendacao}
          </div>
        </div>
      )}

      {/* Scores Detalhados */}
      {analiseResultado && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">
              {analiseResultado.score_tecnico || 0}%
            </div>
            <p className="text-sm text-blue-700">Score Técnico</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-purple-600">
              {analiseResultado.score_comunicacao || 0}%
            </div>
            <p className="text-sm text-purple-700">Comunicação</p>
          </div>
        </div>
      )}

      {/* Pontos Fortes */}
      {analiseResultado?.pontos_fortes && analiseResultado.pontos_fortes.length > 0 && (
        <div className="bg-green-50 p-4 rounded-lg">
          <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
            <CheckCircle size={18} /> Pontos Fortes
          </h4>
          <ul className="space-y-1">
            {analiseResultado.pontos_fortes.map((p, i) => (
              <li key={i} className="text-sm text-green-700">• {p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Pontos de Atenção */}
      {analiseResultado?.pontos_atencao && analiseResultado.pontos_atencao.length > 0 && (
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h4 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
            <AlertTriangle size={18} /> Pontos de Atenção
          </h4>
          <ul className="space-y-1">
            {analiseResultado.pontos_atencao.map((p, i) => (
              <li key={i} className="text-sm text-yellow-700">• {p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Red Flags */}
      {analiseResultado?.red_flags && analiseResultado.red_flags.length > 0 && (
        <div className="bg-red-50 p-4 rounded-lg">
          <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <XCircle size={18} /> Red Flags
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="text-purple-600" />
            Entrevista Técnica Inteligente
          </h2>
          <p className="text-sm text-gray-500">
            Integrado com Supabase • Powered by Gemini AI
          </p>
        </div>
        
        {/* Steps Indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map(step => (
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
              {step < currentStep ? <CheckCircle size={16} /> : step}
            </div>
          ))}
        </div>
      </div>

      {/* Erro Global */}
      {error && currentStep !== 4 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800">❌ {error}</p>
        </div>
      )}

      {/* Conteúdo por Step */}
      {currentStep === 1 && renderStep1()}
      {currentStep === 2 && renderStep2()}
      {currentStep === 3 && renderStep3()}
      {currentStep === 4 && renderStep4()}
      {currentStep === 5 && renderStep5()}
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
