/**
 * useAudioEntrevista.ts - Hook para gerenciamento de áudio de entrevistas
 * 
 * Funcionalidades:
 * - Upload de áudio para Supabase Storage
 * - Chamar API de transcrição
 * - Salvar análise da IA
 * - Listar áudios por candidatura/vaga
 * - Gerenciar status do processamento
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface EntrevistaAudio {
  id: number;
  candidatura_id: number;
  vaga_id: number;
  candidato_id: number | null;
  entrevistador_id: number | null;
  tipo_entrevista: 'interna' | 'externa';
  audio_url: string;
  audio_filename: string | null;
  audio_size_bytes: number | null;
  audio_duration_seconds: number | null;
  audio_format: string | null;
  status: 'uploaded' | 'transcribing' | 'transcribed' | 'analyzed' | 'error';
  transcricao_texto: string | null;
  transcricao_confianca: number | null;
  analise_ia: AnaliseIA | null;
  aderencia_calculada: number | null;
  previsao_aprovacao: number | null;
  recomendacao_ia: 'aprovar' | 'reprovar' | 'revisar' | null;
  notas_analista: string | null;
  uploaded_em: string;
  transcrito_em: string | null;
  analisado_em: string | null;
  criado_por: number | null;
}

export interface AnaliseIA {
  resumo: string;
  pontos_fortes: string[];
  pontos_fracos: string[];
  gaps_identificados: string[];
  respostas_questionario: RespostaQuestao[];
  aderencia_vaga: number;
  recomendacao: string;
  previsao_aprovacao: number;
  observacoes_adicionais: string;
}

export interface RespostaQuestao {
  pergunta_id: number;
  pergunta_texto: string;
  respondeu: boolean;
  resposta_extraida: string;
  qualidade: string;
  score: number;
  observacao: string;
}

export interface QuestaoVaga {
  id: number;
  vaga_id: number;
  ordem: number;
  pergunta: string;
  tipo_resposta: string;
  obrigatoria: boolean;
  peso: number;
  criterio_avaliacao: string | null;
  resposta_esperada: string | null;
  gerado_por_ia: boolean;
  ativo: boolean;
}

export interface UploadAudioParams {
  candidaturaId: number;
  vagaId: number;
  candidatoId?: number;
  tipoEntrevista: 'interna' | 'externa';
  arquivo: File;
  criadorId?: number;
}

export interface ProcessamentoResult {
  success: boolean;
  audioId?: number;
  transcricao?: string;
  analise?: AnaliseIA;
  error?: string;
}

// ============================================
// CONSTANTES
// ============================================

const BUCKET_NAME = 'entrevistas-audio';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const FORMATOS_ACEITOS = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'audio/ogg'];
const MAX_SIZE_MB = 50;

// ============================================
// HOOK
// ============================================

export function useAudioEntrevista() {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // UPLOAD DE ÁUDIO
  // ============================================

  const uploadAudio = useCallback(async (params: UploadAudioParams): Promise<ProcessamentoResult> => {
    const { candidaturaId, vagaId, candidatoId, tipoEntrevista, arquivo, criadorId } = params;

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      // Validar arquivo
      if (!FORMATOS_ACEITOS.includes(arquivo.type)) {
        throw new Error(`Formato não suportado: ${arquivo.type}. Formatos aceitos: MP3, WAV, M4A, WebM, OGG`);
      }

      const sizeMB = arquivo.size / (1024 * 1024);
      if (sizeMB > MAX_SIZE_MB) {
        throw new Error(`Arquivo muito grande: ${sizeMB.toFixed(1)}MB. Máximo: ${MAX_SIZE_MB}MB`);
      }

      setProgress(10);

      // Gerar nome único para o arquivo
      const timestamp = Date.now();
      const ext = arquivo.name.split('.').pop() || 'mp3';
      const filename = `vaga_${vagaId}/candidatura_${candidaturaId}/${tipoEntrevista}_${timestamp}.${ext}`;

      // Upload para Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filename, arquivo, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        // Se o bucket não existir, criar uma mensagem mais clara
        if (uploadError.message.includes('not found')) {
          throw new Error('Bucket de áudio não configurado. Execute o script SQL de storage no Supabase.');
        }
        throw uploadError;
      }

      setProgress(50);

      // Obter URL pública (ou signed URL se for privado)
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filename);

      const audioUrl = urlData.publicUrl;

      // Tentar obter duração do áudio (se possível no browser)
      let durationSeconds: number | null = null;
      try {
        durationSeconds = await getAudioDuration(arquivo);
      } catch (e) {
        console.warn('Não foi possível obter duração do áudio');
      }

      setProgress(70);

      // Inserir registro no banco
      const { data: insertData, error: insertError } = await supabase
        .from('entrevista_audios')
        .insert({
          candidatura_id: candidaturaId,
          vaga_id: vagaId,
          candidato_id: candidatoId || null,
          tipo_entrevista: tipoEntrevista,
          audio_url: audioUrl,
          audio_filename: arquivo.name,
          audio_size_bytes: arquivo.size,
          audio_duration_seconds: durationSeconds,
          audio_format: ext,
          status: 'uploaded',
          criado_por: criadorId || null
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setProgress(100);

      return {
        success: true,
        audioId: insertData.id
      };

    } catch (err: any) {
      console.error('Erro no upload:', err);
      setError(err.message);
      return {
        success: false,
        error: err.message
      };
    } finally {
      setUploading(false);
    }
  }, []);

  // ============================================
  // TRANSCREVER ÁUDIO
  // ============================================

  const transcreverAudio = useCallback(async (audioId: number): Promise<ProcessamentoResult> => {
    setTranscribing(true);
    setError(null);

    try {
      // Buscar dados do áudio
      const { data: audioData, error: audioError } = await supabase
        .from('entrevista_audios')
        .select('*')
        .eq('id', audioId)
        .single();

      if (audioError) throw audioError;

      // Atualizar status para 'transcribing'
      await supabase
        .from('entrevista_audios')
        .update({ status: 'transcribing' })
        .eq('id', audioId);

      // Baixar o áudio e converter para base64
      const response = await fetch(audioData.audio_url);
      const blob = await response.blob();
      const base64 = await blobToBase64(blob);

      // Chamar API de transcrição
      const apiResponse = await fetch(`${API_URL}/gemini-audio-transcription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transcribe',
          audioBase64: base64.split(',')[1], // Remove o prefixo data:audio/...;base64,
          audioMimeType: blob.type
        })
      });

      const result = await apiResponse.json();

      if (result.error) {
        // Atualizar status para erro
        await supabase
          .from('entrevista_audios')
          .update({ status: 'error' })
          .eq('id', audioId);
        throw new Error(result.message || result.error);
      }

      // Salvar transcrição
      await supabase
        .from('entrevista_audios')
        .update({
          status: 'transcribed',
          transcricao_texto: result.transcricao,
          transcricao_confianca: result.confianca,
          transcricao_idioma: result.idioma || 'pt-BR',
          transcrito_em: new Date().toISOString()
        })
        .eq('id', audioId);

      return {
        success: true,
        audioId,
        transcricao: result.transcricao
      };

    } catch (err: any) {
      console.error('Erro na transcrição:', err);
      setError(err.message);
      return {
        success: false,
        error: err.message
      };
    } finally {
      setTranscribing(false);
    }
  }, []);

  // ============================================
  // ANALISAR TRANSCRIÇÃO
  // ============================================

  const analisarTranscricao = useCallback(async (audioId: number): Promise<ProcessamentoResult> => {
    setAnalyzing(true);
    setError(null);

    try {
      // Buscar dados do áudio e da vaga
      const { data: audioData, error: audioError } = await supabase
        .from('entrevista_audios')
        .select(`
          *,
          vaga:vagas(id, titulo, descricao_vaga),
          candidato:consultants(nome_consultores)
        `)
        .eq('id', audioId)
        .single();

      if (audioError) throw audioError;

      if (!audioData.transcricao_texto) {
        throw new Error('Áudio ainda não foi transcrito');
      }

      // Buscar questões da vaga
      const { data: questoes } = await supabase
        .from('vaga_questoes')
        .select('*')
        .eq('vaga_id', audioData.vaga_id)
        .eq('ativo', true)
        .order('ordem');

      // Atualizar status
      await supabase
        .from('entrevista_audios')
        .update({ status: 'analyzing' })
        .eq('id', audioId);

      // Chamar API de análise
      const apiResponse = await fetch(`${API_URL}/gemini-audio-transcription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          transcricaoTexto: audioData.transcricao_texto,
          vagaId: audioData.vaga_id,
          vagaTitulo: audioData.vaga?.titulo,
          vagaDescricao: audioData.vaga?.descricao_vaga,
          questoes: questoes || [],
          candidatoNome: audioData.candidato?.nome_consultores,
          tipoEntrevista: audioData.tipo_entrevista
        })
      });

      const result = await apiResponse.json();

      if (result.error) {
        await supabase
          .from('entrevista_audios')
          .update({ status: 'error' })
          .eq('id', audioId);
        throw new Error(result.message || result.error);
      }

      const analise = result.analise;

      // Salvar análise
      await supabase
        .from('entrevista_audios')
        .update({
          status: 'analyzed',
          analise_ia: analise,
          aderencia_calculada: analise.aderencia_vaga,
          previsao_aprovacao: analise.previsao_aprovacao,
          recomendacao_ia: analise.recomendacao,
          analisado_em: new Date().toISOString()
        })
        .eq('id', audioId);

      // Salvar respostas individuais
      if (analise.respostas_questionario && analise.respostas_questionario.length > 0) {
        const respostas = analise.respostas_questionario.map((r: RespostaQuestao) => ({
          entrevista_audio_id: audioId,
          questao_id: r.pergunta_id,
          candidatura_id: audioData.candidatura_id,
          resposta_extraida: r.resposta_extraida,
          respondeu: r.respondeu,
          avaliacao_ia: {
            qualidade: r.qualidade,
            score: r.score,
            observacao: r.observacao
          },
          score_resposta: r.score
        }));

        await supabase
          .from('candidato_respostas')
          .insert(respostas);
      }

      return {
        success: true,
        audioId,
        analise: analise
      };

    } catch (err: any) {
      console.error('Erro na análise:', err);
      setError(err.message);
      return {
        success: false,
        error: err.message
      };
    } finally {
      setAnalyzing(false);
    }
  }, []);

  // ============================================
  // PROCESSAR COMPLETO (Upload + Transcrição + Análise)
  // ============================================

  const processarCompleto = useCallback(async (params: UploadAudioParams): Promise<ProcessamentoResult> => {
    setLoading(true);
    try {
      // 1. Upload
      const uploadResult = await uploadAudio(params);
      if (!uploadResult.success || !uploadResult.audioId) {
        return uploadResult;
      }

      // 2. Transcrição
      const transcricaoResult = await transcreverAudio(uploadResult.audioId);
      if (!transcricaoResult.success) {
        return transcricaoResult;
      }

      // 3. Análise
      const analiseResult = await analisarTranscricao(uploadResult.audioId);
      
      return {
        ...analiseResult,
        transcricao: transcricaoResult.transcricao
      };

    } finally {
      setLoading(false);
    }
  }, [uploadAudio, transcreverAudio, analisarTranscricao]);

  // ============================================
  // LISTAR ÁUDIOS
  // ============================================

  const listarAudiosPorCandidatura = useCallback(async (candidaturaId: number): Promise<EntrevistaAudio[]> => {
    const { data, error } = await supabase
      .from('entrevista_audios')
      .select('*')
      .eq('candidatura_id', candidaturaId)
      .order('uploaded_em', { ascending: false });

    if (error) {
      console.error('Erro ao listar áudios:', error);
      return [];
    }

    return data || [];
  }, []);

  const listarAudiosPorVaga = useCallback(async (vagaId: number): Promise<EntrevistaAudio[]> => {
    const { data, error } = await supabase
      .from('vw_entrevistas_audio')
      .select('*')
      .eq('vaga_id', vagaId)
      .order('uploaded_em', { ascending: false });

    if (error) {
      console.error('Erro ao listar áudios da vaga:', error);
      return [];
    }

    return data || [];
  }, []);

  // ============================================
  // BUSCAR ÁUDIO
  // ============================================

  const buscarAudio = useCallback(async (audioId: number): Promise<EntrevistaAudio | null> => {
    const { data, error } = await supabase
      .from('entrevista_audios')
      .select(`
        *,
        vaga:vagas(titulo),
        candidato:consultants(nome_consultores),
        entrevistador:app_users(nome_usuario)
      `)
      .eq('id', audioId)
      .single();

    if (error) {
      console.error('Erro ao buscar áudio:', error);
      return null;
    }

    return data;
  }, []);

  // ============================================
  // QUESTÕES DA VAGA
  // ============================================

  const listarQuestoesVaga = useCallback(async (vagaId: number): Promise<QuestaoVaga[]> => {
    const { data, error } = await supabase
      .from('vaga_questoes')
      .select('*')
      .eq('vaga_id', vagaId)
      .eq('ativo', true)
      .order('ordem');

    if (error) {
      console.error('Erro ao listar questões:', error);
      return [];
    }

    return data || [];
  }, []);

  // ============================================
  // ATUALIZAR NOTAS
  // ============================================

  const atualizarNotas = useCallback(async (audioId: number, notas: string): Promise<boolean> => {
    const { error } = await supabase
      .from('entrevista_audios')
      .update({ notas_analista: notas })
      .eq('id', audioId);

    if (error) {
      console.error('Erro ao atualizar notas:', error);
      return false;
    }

    return true;
  }, []);

  // ============================================
  // DELETAR ÁUDIO
  // ============================================

  const deletarAudio = useCallback(async (audioId: number): Promise<boolean> => {
    try {
      // Buscar dados do áudio para saber o arquivo
      const { data: audio } = await supabase
        .from('entrevista_audios')
        .select('audio_url')
        .eq('id', audioId)
        .single();

      if (audio) {
        // Extrair path do storage da URL
        const url = new URL(audio.audio_url);
        const path = url.pathname.split('/').slice(-3).join('/'); // vaga_X/candidatura_Y/arquivo

        // Deletar do storage
        await supabase.storage
          .from(BUCKET_NAME)
          .remove([path]);
      }

      // Deletar do banco (cascade deleta respostas também)
      const { error } = await supabase
        .from('entrevista_audios')
        .delete()
        .eq('id', audioId);

      if (error) throw error;

      return true;
    } catch (err) {
      console.error('Erro ao deletar áudio:', err);
      return false;
    }
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    loading,
    uploading,
    transcribing,
    analyzing,
    progress,
    error,

    // Ações principais
    uploadAudio,
    transcreverAudio,
    analisarTranscricao,
    processarCompleto,

    // Consultas
    listarAudiosPorCandidatura,
    listarAudiosPorVaga,
    buscarAudio,
    listarQuestoesVaga,

    // Outras ações
    atualizarNotas,
    deletarAudio,

    // Constantes
    FORMATOS_ACEITOS,
    MAX_SIZE_MB
  };
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      resolve(Math.round(audio.duration));
    };
    audio.onerror = reject;
    audio.src = URL.createObjectURL(file);
  });
}

export default useAudioEntrevista;
