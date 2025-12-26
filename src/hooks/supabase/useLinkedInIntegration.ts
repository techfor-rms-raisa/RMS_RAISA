/**
 * useLinkedInIntegration.ts - Hook para Integração LinkedIn
 * 
 * Funcionalidades:
 * - Importar perfis do LinkedIn
 * - Calcular match com vagas
 * - Converter perfil em candidato
 * - Buscar sugestões
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface ExperienciaLinkedIn {
  empresa: string;
  cargo: string;
  periodo: string;
  descricao?: string;
  atual?: boolean;
}

export interface FormacaoLinkedIn {
  instituicao: string;
  curso: string;
  grau?: string;
  ano_conclusao?: number;
}

export interface LinkedInProfile {
  id?: number;
  linkedin_id?: string;
  linkedin_url?: string;
  linkedin_username?: string;
  nome_completo: string;
  headline?: string;
  localizacao?: string;
  foto_url?: string;
  email?: string;
  telefone?: string;
  resumo?: string;
  experiencias?: ExperienciaLinkedIn[];
  formacoes?: FormacaoLinkedIn[];
  skills?: string[];
  certificacoes?: string[];
  idiomas?: { idioma: string; nivel: string }[];
  anos_experiencia?: number;
  senioridade_estimada?: 'junior' | 'pleno' | 'senior' | 'especialista';
  area_atuacao?: string;
  ultimo_cargo?: string;
  ultima_empresa?: string;
  status?: string;
  candidato_id?: number;
  importado_em?: string;
}

export interface LinkedInMatch {
  match_id: number;
  vaga_id: number;
  vaga_titulo: string;
  cliente_id: number;
  cliente_nome: string;
  profile_id: number;
  nome_completo: string;
  headline: string;
  localizacao: string;
  linkedin_url: string;
  anos_experiencia: number;
  senioridade_estimada: string;
  ultimo_cargo: string;
  ultima_empresa: string;
  skills: string[];
  score_match: number;
  score_skills: number;
  score_experiencia: number;
  skills_match: {
    match: string[];
    faltam: string[];
  };
  status: string;
  criado_em: string;
  ja_candidato: boolean;
}

export interface ImportResult {
  sucesso: boolean;
  profileId?: number;
  mensagem: string;
  matchesGerados?: number;
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Estima senioridade baseado em anos de experiência
 */
function estimarSenioridade(anosExp: number): 'junior' | 'pleno' | 'senior' | 'especialista' {
  if (anosExp >= 10) return 'especialista';
  if (anosExp >= 6) return 'senior';
  if (anosExp >= 3) return 'pleno';
  return 'junior';
}

/**
 * Calcula anos de experiência baseado nas experiências
 */
function calcularAnosExperiencia(experiencias: ExperienciaLinkedIn[]): number {
  if (!experiencias || experiencias.length === 0) return 0;
  
  // Simplificado: considera a primeira experiência até hoje
  // Em produção, seria mais sofisticado
  let totalAnos = 0;
  
  experiencias.forEach(exp => {
    if (exp.periodo) {
      const match = exp.periodo.match(/(\d{4})/g);
      if (match && match.length >= 1) {
        const anoInicio = parseInt(match[0]);
        const anoFim = match.length > 1 ? parseInt(match[1]) : new Date().getFullYear();
        totalAnos += (anoFim - anoInicio);
      }
    }
  });
  
  return Math.max(0, totalAnos);
}

/**
 * Extrai último cargo e empresa
 */
function extrairUltimaExperiencia(experiencias: ExperienciaLinkedIn[]): { cargo: string; empresa: string } {
  if (!experiencias || experiencias.length === 0) {
    return { cargo: '', empresa: '' };
  }
  
  // Procura a experiência atual ou a primeira da lista
  const atual = experiencias.find(e => e.atual) || experiencias[0];
  return {
    cargo: atual.cargo || '',
    empresa: atual.empresa || ''
  };
}

// ============================================
// HOOK
// ============================================

export function useLinkedInIntegration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<LinkedInProfile[]>([]);
  const [matches, setMatches] = useState<LinkedInMatch[]>([]);

  // ============================================
  // IMPORTAR PERFIL MANUALMENTE
  // ============================================

  const importarPerfil = useCallback(async (
    perfil: Partial<LinkedInProfile>,
    userId: number,
    processarMatches: boolean = true
  ): Promise<ImportResult> => {
    setLoading(true);
    setError(null);

    try {
      // Validar dados mínimos
      if (!perfil.nome_completo) {
        throw new Error('Nome completo é obrigatório');
      }

      // Calcular campos derivados
      const anosExp = perfil.anos_experiencia || calcularAnosExperiencia(perfil.experiencias || []);
      const senioridade = perfil.senioridade_estimada || estimarSenioridade(anosExp);
      const { cargo, empresa } = extrairUltimaExperiencia(perfil.experiencias || []);

      // Verificar se já existe (por LinkedIn URL ou email)
      if (perfil.linkedin_url) {
        const { data: existente } = await supabase
          .from('linkedin_profiles')
          .select('id')
          .eq('linkedin_url', perfil.linkedin_url)
          .single();

        if (existente) {
          return {
            sucesso: false,
            mensagem: 'Perfil já importado anteriormente',
            profileId: existente.id
          };
        }
      }

      // Inserir perfil
      const { data: novoPerfil, error: insertError } = await supabase
        .from('linkedin_profiles')
        .insert({
          linkedin_id: perfil.linkedin_id,
          linkedin_url: perfil.linkedin_url,
          linkedin_username: perfil.linkedin_username,
          nome_completo: perfil.nome_completo,
          headline: perfil.headline,
          localizacao: perfil.localizacao,
          foto_url: perfil.foto_url,
          email: perfil.email,
          telefone: perfil.telefone,
          resumo: perfil.resumo,
          experiencias: perfil.experiencias || [],
          formacoes: perfil.formacoes || [],
          skills: perfil.skills || [],
          certificacoes: perfil.certificacoes || [],
          idiomas: perfil.idiomas || [],
          anos_experiencia: anosExp,
          senioridade_estimada: senioridade,
          ultimo_cargo: cargo,
          ultima_empresa: empresa,
          status: 'importado',
          importado_por: userId,
          fonte: 'manual'
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Processar matches com vagas abertas
      let matchesGerados = 0;
      if (processarMatches && novoPerfil) {
        const { data: matchResult } = await supabase
          .rpc('fn_processar_linkedin_match', {
            p_profile_id: novoPerfil.id,
            p_vagas_ids: null // Todas as vagas abertas
          });

        matchesGerados = matchResult || 0;
      }

      return {
        sucesso: true,
        profileId: novoPerfil.id,
        mensagem: `Perfil importado com sucesso!${matchesGerados > 0 ? ` ${matchesGerados} matches gerados.` : ''}`,
        matchesGerados
      };

    } catch (err: any) {
      console.error('Erro ao importar perfil:', err);
      setError(err.message);
      return {
        sucesso: false,
        mensagem: err.message
      };
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // IMPORTAR DE JSON (Chrome Extension / API)
  // ============================================

  const importarDeJSON = useCallback(async (
    jsonData: any,
    userId: number
  ): Promise<ImportResult> => {
    try {
      // Parser para diferentes formatos de JSON do LinkedIn
      const perfil: Partial<LinkedInProfile> = {
        linkedin_id: jsonData.id || jsonData.publicIdentifier,
        linkedin_url: jsonData.linkedInUrl || jsonData.profileUrl || jsonData.url,
        nome_completo: jsonData.fullName || jsonData.firstName + ' ' + jsonData.lastName,
        headline: jsonData.headline || jsonData.title,
        localizacao: jsonData.location || jsonData.locationName,
        foto_url: jsonData.profilePicture || jsonData.photoUrl,
        email: jsonData.email,
        resumo: jsonData.summary || jsonData.about,
        experiencias: (jsonData.experiences || jsonData.positions || []).map((e: any) => ({
          empresa: e.companyName || e.company,
          cargo: e.title || e.position,
          periodo: e.dateRange || `${e.startDate || ''} - ${e.endDate || 'Atual'}`,
          descricao: e.description,
          atual: e.isCurrent || !e.endDate
        })),
        formacoes: (jsonData.educations || jsonData.education || []).map((f: any) => ({
          instituicao: f.schoolName || f.school,
          curso: f.fieldOfStudy || f.degree,
          grau: f.degreeName,
          ano_conclusao: f.endDate ? parseInt(f.endDate) : null
        })),
        skills: jsonData.skills?.map((s: any) => typeof s === 'string' ? s : s.name) || [],
        certificacoes: jsonData.certifications?.map((c: any) => c.name) || [],
        idiomas: jsonData.languages?.map((l: any) => ({
          idioma: typeof l === 'string' ? l : l.name,
          nivel: l.proficiency || 'Não especificado'
        })) || []
      };

      return await importarPerfil(perfil, userId, true);

    } catch (err: any) {
      return {
        sucesso: false,
        mensagem: `Erro ao processar JSON: ${err.message}`
      };
    }
  }, [importarPerfil]);

  // ============================================
  // BUSCAR PERFIS IMPORTADOS
  // ============================================

  const buscarPerfis = useCallback(async (
    filtros?: {
      status?: string;
      senioridade?: string;
      skills?: string[];
      termo?: string;
      limite?: number;
    }
  ): Promise<LinkedInProfile[]> => {
    setLoading(true);
    try {
      let query = supabase
        .from('linkedin_profiles')
        .select('*')
        .order('importado_em', { ascending: false });

      if (filtros?.status) {
        query = query.eq('status', filtros.status);
      }
      if (filtros?.senioridade) {
        query = query.eq('senioridade_estimada', filtros.senioridade);
      }
      if (filtros?.termo) {
        query = query.or(`nome_completo.ilike.%${filtros.termo}%,headline.ilike.%${filtros.termo}%`);
      }
      if (filtros?.limite) {
        query = query.limit(filtros.limite);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProfiles(data || []);
      return data || [];

    } catch (err: any) {
      console.error('Erro ao buscar perfis:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // BUSCAR MATCHES
  // ============================================

  const buscarMatches = useCallback(async (
    filtros?: {
      vagaId?: number;
      profileId?: number;
      status?: string;
      scoreMinimo?: number;
      limite?: number;
    }
  ): Promise<LinkedInMatch[]> => {
    setLoading(true);
    try {
      let query = supabase
        .from('vw_linkedin_matches')
        .select('*')
        .order('score_match', { ascending: false });

      if (filtros?.vagaId) {
        query = query.eq('vaga_id', filtros.vagaId);
      }
      if (filtros?.profileId) {
        query = query.eq('profile_id', filtros.profileId);
      }
      if (filtros?.status) {
        query = query.eq('status', filtros.status);
      }
      if (filtros?.scoreMinimo) {
        query = query.gte('score_match', filtros.scoreMinimo);
      }
      if (filtros?.limite) {
        query = query.limit(filtros.limite);
      }

      const { data, error } = await query;

      if (error) throw error;
      setMatches(data || []);
      return data || [];

    } catch (err: any) {
      console.error('Erro ao buscar matches:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // APROVAR MATCH (Converter em Candidato)
  // ============================================

  const aprovarMatch = useCallback(async (
    matchId: number,
    userId: number
  ): Promise<{ sucesso: boolean; candidaturaId?: number; mensagem: string }> => {
    setLoading(true);
    setError(null);

    try {
      // Buscar dados do match
      const { data: match, error: matchError } = await supabase
        .from('linkedin_vaga_match')
        .select(`
          *,
          profile:linkedin_profiles(*),
          vaga:vagas(*)
        `)
        .eq('id', matchId)
        .single();

      if (matchError) throw matchError;

      // Verificar se já não foi aprovado
      if (match.status === 'enviado' && match.candidatura_id) {
        return {
          sucesso: false,
          mensagem: 'Match já foi convertido em candidatura',
          candidaturaId: match.candidatura_id
        };
      }

      // Criar candidatura (ou vincular a candidato existente)
      // Aqui você pode escolher: criar novo consultor ou apenas candidatura
      const { data: candidatura, error: candError } = await supabase
        .from('candidaturas')
        .insert({
          vaga_id: match.vaga_id,
          candidato_id: match.profile.candidato_id, // Pode ser null
          status: 'triagem',
          origem: 'linkedin',
          observacoes: `Importado do LinkedIn: ${match.profile.linkedin_url}`,
          score_ia: match.score_match
        })
        .select()
        .single();

      if (candError) throw candError;

      // Atualizar match
      await supabase
        .from('linkedin_vaga_match')
        .update({
          status: 'enviado',
          aprovado_por: userId,
          aprovado_em: new Date().toISOString(),
          candidatura_id: candidatura.id
        })
        .eq('id', matchId);

      // Atualizar perfil
      await supabase
        .from('linkedin_profiles')
        .update({ status: 'vinculado' })
        .eq('id', match.linkedin_profile_id);

      return {
        sucesso: true,
        candidaturaId: candidatura.id,
        mensagem: 'Candidatura criada com sucesso!'
      };

    } catch (err: any) {
      console.error('Erro ao aprovar match:', err);
      setError(err.message);
      return {
        sucesso: false,
        mensagem: err.message
      };
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // DESCARTAR MATCH
  // ============================================

  const descartarMatch = useCallback(async (matchId: number): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('linkedin_vaga_match')
        .update({ status: 'descartado' })
        .eq('id', matchId);

      if (error) throw error;
      return true;

    } catch (err: any) {
      console.error('Erro ao descartar match:', err);
      return false;
    }
  }, []);

  // ============================================
  // RECALCULAR MATCHES PARA UM PERFIL
  // ============================================

  const recalcularMatches = useCallback(async (profileId: number): Promise<number> => {
    try {
      const { data } = await supabase
        .rpc('fn_processar_linkedin_match', {
          p_profile_id: profileId,
          p_vagas_ids: null
        });

      return data || 0;

    } catch (err: any) {
      console.error('Erro ao recalcular matches:', err);
      return 0;
    }
  }, []);

  // ============================================
  // ESTATÍSTICAS
  // ============================================

  const buscarEstatisticas = useCallback(async (): Promise<{
    totalPerfis: number;
    totalMatches: number;
    matchesAprovados: number;
    mediaScore: number;
  }> => {
    try {
      const { count: totalPerfis } = await supabase
        .from('linkedin_profiles')
        .select('*', { count: 'exact', head: true });

      const { data: matchStats } = await supabase
        .from('linkedin_vaga_match')
        .select('status, score_match');

      const totalMatches = matchStats?.length || 0;
      const matchesAprovados = matchStats?.filter(m => m.status === 'enviado').length || 0;
      const mediaScore = matchStats && matchStats.length > 0
        ? matchStats.reduce((sum, m) => sum + (m.score_match || 0), 0) / matchStats.length
        : 0;

      return {
        totalPerfis: totalPerfis || 0,
        totalMatches,
        matchesAprovados,
        mediaScore: Math.round(mediaScore * 10) / 10
      };

    } catch (err: any) {
      console.error('Erro ao buscar estatísticas:', err);
      return {
        totalPerfis: 0,
        totalMatches: 0,
        matchesAprovados: 0,
        mediaScore: 0
      };
    }
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    loading,
    error,
    profiles,
    matches,
    importarPerfil,
    importarDeJSON,
    buscarPerfis,
    buscarMatches,
    aprovarMatch,
    descartarMatch,
    recalcularMatches,
    buscarEstatisticas
  };
}

export default useLinkedInIntegration;
