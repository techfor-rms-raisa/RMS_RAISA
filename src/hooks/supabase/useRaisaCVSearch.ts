/**
 * useRaisaCVSearch.ts - Hook para Busca de CVs RAISA
 * 
 * Gerencia:
 * - Busca de CVs por skills
 * - Busca full-text
 * - Match vaga-candidato
 * - Processamento de CV com IA
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../config/supabase';
import { Vaga, Pessoa } from '@/types';

// ============================================
// TIPOS
// ============================================

export interface PessoaSkill {
  id: number;
  pessoa_id: number;
  skill_nome: string;
  skill_categoria: string;
  nivel: string;
  anos_experiencia: number;
  certificado: boolean;
}

export interface PessoaExperiencia {
  id: number;
  pessoa_id: number;
  empresa: string;
  cargo: string;
  data_inicio: string;
  data_fim: string | null;
  atual: boolean;
  descricao: string;
  tecnologias_usadas: string[];
}

export interface CandidatoMatch {
  pessoa_id: number;
  nome: string;
  email: string;
  telefone?: string;
  titulo_profissional: string;
  senioridade: string;
  disponibilidade: string;
  modalidade_preferida: string;
  pretensao_salarial: number;
  score_total: number;
  score_skills: number;
  score_experiencia: number;
  score_senioridade: number;
  skills_match: string[];
  skills_faltantes: string[];
  skills_extras: string[];
  justificativa_ia: string;
  status: 'novo' | 'visualizado' | 'selecionado' | 'descartado' | 'candidatura_criada';
  top_skills?: string[];
  anos_experiencia_total?: number;
  emprego_atual?: string;
}

export interface VagaCandidatoMatchDB {
  id: number;
  vaga_id: number;
  pessoa_id: number;
  score_total: number;
  score_skills: number;
  score_experiencia: number;
  score_senioridade: number;
  score_salario: number;
  score_disponibilidade: number;
  score_localizacao: number;
  skills_match: any;
  skills_faltantes: any;
  skills_extras: any;
  justificativa_ia: string;
  status: string;
  selecionado_por: number | null;
  selecionado_em: string | null;
  motivo_descarte: string | null;
  candidatura_id: number | null;
  calculado_em: string;
}

export interface ProcessamentoCVResult {
  sucesso: boolean;
  pessoa_id: number;
  skills_extraidas: PessoaSkill[];
  experiencias_extraidas: PessoaExperiencia[];
  resumo: string;
  titulo_sugerido: string;
  senioridade_detectada: string;
  erro?: string;
}

export interface BuscaFiltros {
  skills?: string[];
  senioridade?: string;
  modalidade?: string;
  disponibilidade?: string;
  salario_max?: number;
  cidade?: string;
  estado?: string;
  termo_busca?: string;
  limite?: number;
}

// ============================================
// HOOK
// ============================================

export const useRaisaCVSearch = () => {
  const [matches, setMatches] = useState<CandidatoMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  // ============================================
  // BUSCA DE CVs POR SKILLS
  // ============================================

  /**
   * Busca candidatos com base nas skills da vaga
   */
  const buscarPorSkills = useCallback(async (
    skills: string[],
    filtros?: Omit<BuscaFiltros, 'skills'>
  ): Promise<CandidatoMatch[]> => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🔍 Buscando candidatos por skills: ${skills.join(', ')}`);

      // Chamar função RPC do Supabase
      const { data, error: rpcError } = await supabase.rpc('buscar_candidatos_por_skills', {
        p_skills: skills,
        p_senioridade: filtros?.senioridade || null,
        p_modalidade: filtros?.modalidade || null,
        p_disponibilidade: filtros?.disponibilidade || null,
        p_limite: filtros?.limite || 20
      });

      if (rpcError) {
        console.warn('⚠️ RPC não disponível, usando busca alternativa...');
        return await buscarPorSkillsAlternativo(skills, filtros);
      }

      const resultados: CandidatoMatch[] = (data || []).map((r: any) => ({
        pessoa_id: r.pessoa_id,
        nome: r.nome,
        email: r.email,
        titulo_profissional: r.titulo_profissional || 'Não informado',
        senioridade: r.senioridade || 'Não informado',
        disponibilidade: r.disponibilidade || 'Não informado',
        modalidade_preferida: r.modalidade_preferida || 'Não informado',
        pretensao_salarial: r.pretensao_salarial || 0,
        score_total: r.score_match || 0,
        score_skills: r.score_match || 0,
        score_experiencia: 0,
        score_senioridade: 0,
        skills_match: r.skills_encontradas || [],
        skills_faltantes: skills.filter(s => 
          !(r.skills_encontradas || []).some((e: string) => 
            e.toLowerCase() === s.toLowerCase()
          )
        ),
        skills_extras: [],
        justificativa_ia: '',
        status: 'novo',
        top_skills: r.skills_encontradas || []
      }));

      setMatches(resultados);
      console.log(`✅ ${resultados.length} candidatos encontrados`);
      return resultados;
    } catch (err: any) {
      console.error('❌ Erro na busca:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Busca alternativa quando RPC não está disponível
   */
  const buscarPorSkillsAlternativo = async (
    skills: string[],
    filtros?: Omit<BuscaFiltros, 'skills'>
  ): Promise<CandidatoMatch[]> => {
    try {
      // Buscar pessoas que têm skills correspondentes
      const skillsLower = skills.map(s => s.toLowerCase());
      
      const { data: skillsData, error: skillsError } = await supabase
        .from('pessoa_skills')
        .select('pessoa_id, skill_nome')
        .in('skill_nome', skillsLower);

      if (skillsError) {
        // Se tabela não existe, buscar direto em pessoas
        console.warn('⚠️ Tabela pessoa_skills não encontrada, buscando em pessoas...');
        return await buscarEmPessoas(skills, filtros);
      }

      // Agrupar por pessoa
      const pessoaSkillsMap = new Map<number, string[]>();
      (skillsData || []).forEach((s: any) => {
        const current = pessoaSkillsMap.get(s.pessoa_id) || [];
        current.push(s.skill_nome);
        pessoaSkillsMap.set(s.pessoa_id, current);
      });

      // Ordenar por quantidade de matches
      const pessoasOrdenadas = Array.from(pessoaSkillsMap.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, filtros?.limite || 20);

      if (pessoasOrdenadas.length === 0) {
        return [];
      }

      // Buscar dados completos das pessoas
      const pessoaIds = pessoasOrdenadas.map(([id]) => id);
      
      let query = supabase
        .from('pessoas')
        .select('*')
        .in('id', pessoaIds)
        .eq('ativo', true);

      if (filtros?.senioridade) {
        query = query.eq('senioridade', filtros.senioridade);
      }

      const { data: pessoasData, error: pessoasError } = await query;

      if (pessoasError) throw pessoasError;

      const resultados: CandidatoMatch[] = (pessoasData || []).map((p: any) => {
        const skillsMatch = pessoaSkillsMap.get(p.id) || [];
        const scoreMatch = Math.round((skillsMatch.length / skills.length) * 100);

        return {
          pessoa_id: p.id,
          nome: p.nome,
          email: p.email,
          telefone: p.telefone,
          titulo_profissional: p.titulo_profissional || 'Não informado',
          senioridade: p.senioridade || 'Não informado',
          disponibilidade: p.disponibilidade || 'Não informado',
          modalidade_preferida: p.modalidade_preferida || 'Não informado',
          pretensao_salarial: p.pretensao_salarial || 0,
          score_total: scoreMatch,
          score_skills: scoreMatch,
          score_experiencia: 0,
          score_senioridade: 0,
          skills_match: skillsMatch,
          skills_faltantes: skills.filter(s => 
            !skillsMatch.some(e => e.toLowerCase() === s.toLowerCase())
          ),
          skills_extras: [],
          justificativa_ia: '',
          status: 'novo' as const
        };
      });

      // Ordenar por score
      resultados.sort((a, b) => b.score_total - a.score_total);

      setMatches(resultados);
      return resultados;
    } catch (err: any) {
      console.error('❌ Erro na busca alternativa:', err);
      throw err;
    }
  };

  /**
   * Busca direta em pessoas quando não há tabela de skills
   */
  const buscarEmPessoas = async (
    skills: string[],
    filtros?: Omit<BuscaFiltros, 'skills'>
  ): Promise<CandidatoMatch[]> => {
    try {
      let query = supabase
        .from('pessoas')
        .select('*')
        .eq('ativo', true)
        .limit(filtros?.limite || 20);

      if (filtros?.senioridade) {
        query = query.eq('senioridade', filtros.senioridade);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filtrar por texto do CV se disponível
      const resultados: CandidatoMatch[] = (data || [])
        .filter((p: any) => {
          if (!p.cv_texto_completo) return true; // Incluir se não tem CV
          const cvLower = p.cv_texto_completo.toLowerCase();
          return skills.some(s => cvLower.includes(s.toLowerCase()));
        })
        .map((p: any) => {
          const cvLower = (p.cv_texto_completo || '').toLowerCase();
          const skillsMatch = skills.filter(s => cvLower.includes(s.toLowerCase()));
          const scoreMatch = skills.length > 0 
            ? Math.round((skillsMatch.length / skills.length) * 100)
            : 50;

          return {
            pessoa_id: p.id,
            nome: p.nome,
            email: p.email,
            telefone: p.telefone,
            titulo_profissional: p.titulo_profissional || 'Não informado',
            senioridade: p.senioridade || 'Não informado',
            disponibilidade: p.disponibilidade || 'Não informado',
            modalidade_preferida: p.modalidade_preferida || 'Não informado',
            pretensao_salarial: p.pretensao_salarial || 0,
            score_total: scoreMatch,
            score_skills: scoreMatch,
            score_experiencia: 0,
            score_senioridade: 0,
            skills_match: skillsMatch,
            skills_faltantes: skills.filter(s => 
              !skillsMatch.some(e => e.toLowerCase() === s.toLowerCase())
            ),
            skills_extras: [],
            justificativa_ia: '',
            status: 'novo' as const
          };
        });

      resultados.sort((a, b) => b.score_total - a.score_total);
      setMatches(resultados);
      return resultados;
    } catch (err: any) {
      console.error('❌ Erro na busca em pessoas:', err);
      throw err;
    }
  };

  // ============================================
  // BUSCA PARA UMA VAGA ESPECÍFICA
  // ============================================

  /**
   * Busca candidatos aderentes a uma vaga específica
   */
  const buscarParaVaga = useCallback(async (
    vaga: Vaga,
    limite: number = 20
  ): Promise<CandidatoMatch[]> => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🎯 Buscando candidatos para vaga: ${vaga.titulo}`);

      // Extrair skills da vaga
      let skills: string[] = [];
      
      if (Array.isArray(vaga.stack_tecnologica)) {
        skills = vaga.stack_tecnologica;
      } else if (typeof vaga.stack_tecnologica === 'string') {
        skills = vaga.stack_tecnologica.split(',').map(s => s.trim()).filter(Boolean);
      }

      if (skills.length === 0) {
        console.warn('⚠️ Vaga não tem stack tecnológica definida');
        setMatches([]);
        return [];
      }

      // Buscar candidatos
      const resultados = await buscarPorSkills(skills, {
        senioridade: vaga.senioridade,
        limite
      });

      // Calcular score completo considerando outros fatores
      const resultadosCompletos = resultados.map(r => {
        let scoreExtra = 0;

        // Bonus por senioridade compatível
        if (r.senioridade === vaga.senioridade) {
          scoreExtra += 10;
        }

        // Bonus por disponibilidade
        if (r.disponibilidade === 'imediata') {
          scoreExtra += 5;
        }

        // Ajustar score total
        const scoreAjustado = Math.min(100, r.score_total + scoreExtra);

        return {
          ...r,
          score_total: scoreAjustado,
          score_senioridade: r.senioridade === vaga.senioridade ? 100 : 50
        };
      });

      // Reordenar
      resultadosCompletos.sort((a, b) => b.score_total - a.score_total);

      setMatches(resultadosCompletos);
      console.log(`✅ ${resultadosCompletos.length} candidatos encontrados para a vaga`);
      
      return resultadosCompletos;
    } catch (err: any) {
      console.error('❌ Erro ao buscar para vaga:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [buscarPorSkills]);

  // ============================================
  // SALVAR MATCH NO BANCO
  // ============================================

  /**
   * Salva resultado de match no banco de dados
   */
  const salvarMatch = useCallback(async (
    vagaId: number,
    match: CandidatoMatch
  ): Promise<boolean> => {
    try {
      const matchData = {
        vaga_id: vagaId,
        pessoa_id: match.pessoa_id,
        score_total: match.score_total,
        score_skills: match.score_skills,
        score_experiencia: match.score_experiencia,
        score_senioridade: match.score_senioridade,
        skills_match: { items: match.skills_match },
        skills_faltantes: { items: match.skills_faltantes },
        skills_extras: { items: match.skills_extras },
        justificativa_ia: match.justificativa_ia,
        status: match.status,
        calculado_em: new Date().toISOString()
      };

      const { error } = await supabase
        .from('vaga_candidato_match')
        .upsert(matchData, { onConflict: 'vaga_id,pessoa_id' });

      if (error) throw error;
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao salvar match:', err);
      return false;
    }
  }, []);

  /**
   * Salva todos os matches de uma busca
   */
  const salvarMatchesVaga = useCallback(async (
    vagaId: number,
    matches: CandidatoMatch[]
  ): Promise<boolean> => {
    try {
      setLoading(true);
      console.log(`💾 Salvando ${matches.length} matches...`);

      for (const match of matches) {
        await salvarMatch(vagaId, match);
      }

      console.log('✅ Matches salvos com sucesso');
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao salvar matches:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [salvarMatch]);

  // ============================================
  // ATUALIZAR STATUS DO MATCH
  // ============================================

  /**
   * Atualiza status de um match (selecionar, descartar, etc)
   */
  const atualizarStatusMatch = useCallback(async (
    vagaId: number,
    pessoaId: number,
    novoStatus: 'visualizado' | 'selecionado' | 'descartado',
    userId?: number,
    motivo?: string
  ): Promise<boolean> => {
    try {
      const updateData: any = {
        status: novoStatus
      };

      if (novoStatus === 'selecionado' && userId) {
        updateData.selecionado_por = userId;
        updateData.selecionado_em = new Date().toISOString();
      }

      if (novoStatus === 'descartado' && motivo) {
        updateData.motivo_descarte = motivo;
      }

      const { error } = await supabase
        .from('vaga_candidato_match')
        .update(updateData)
        .eq('vaga_id', vagaId)
        .eq('pessoa_id', pessoaId);

      if (error) throw error;

      // Atualizar estado local
      setMatches(prev => prev.map(m => 
        m.pessoa_id === pessoaId ? { ...m, status: novoStatus } : m
      ));

      return true;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar status:', err);
      return false;
    }
  }, []);

  // ============================================
  // CRIAR CANDIDATURA A PARTIR DO MATCH
  // ============================================

  /**
   * Cria uma candidatura a partir de um match selecionado
   */
  const criarCandidaturaDoMatch = useCallback(async (
    vagaId: number,
    pessoaId: number,
    analistaId: number
  ): Promise<number | null> => {
    try {
      setLoading(true);
      console.log('📝 Criando candidatura do match...');

      // Buscar dados da pessoa
      const { data: pessoa, error: pessoaError } = await supabase
        .from('pessoas')
        .select('*')
        .eq('id', pessoaId)
        .single();

      if (pessoaError) throw pessoaError;

      // Criar candidatura
      const candidaturaData = {
        vaga_id: vagaId,
        pessoa_id: pessoaId,
        candidato_nome: pessoa.nome,
        candidato_email: pessoa.email,
        candidato_cpf: pessoa.cpf,
        analista_id: analistaId,
        status: 'triagem',
        cv_url: pessoa.curriculo_url,
        curriculo_texto: pessoa.cv_texto_completo,
        observacoes: 'Candidatura criada via busca inteligente de CVs',
        criado_em: new Date().toISOString()
      };

      const { data: candidatura, error: candidaturaError } = await supabase
        .from('candidaturas')
        .insert(candidaturaData)
        .select()
        .single();

      if (candidaturaError) throw candidaturaError;

      // Atualizar match com link da candidatura
      await supabase
        .from('vaga_candidato_match')
        .update({
          status: 'candidatura_criada',
          candidatura_id: candidatura.id
        })
        .eq('vaga_id', vagaId)
        .eq('pessoa_id', pessoaId);

      console.log(`✅ Candidatura criada: ID ${candidatura.id}`);
      return candidatura.id;
    } catch (err: any) {
      console.error('❌ Erro ao criar candidatura:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // CARREGAR MATCHES SALVOS
  // ============================================

  /**
   * Carrega matches salvos de uma vaga
   */
  const carregarMatchesVaga = useCallback(async (vagaId: number): Promise<CandidatoMatch[]> => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('vaga_candidato_match')
        .select(`
          *,
          pessoas!pessoa_id (
            nome,
            email,
            telefone,
            titulo_profissional,
            senioridade,
            disponibilidade,
            modalidade_preferida,
            pretensao_salarial
          )
        `)
        .eq('vaga_id', vagaId)
        .order('score_total', { ascending: false });

      if (error) throw error;

      const resultados: CandidatoMatch[] = (data || []).map((m: any) => ({
        pessoa_id: m.pessoa_id,
        nome: m.pessoas?.nome || 'N/A',
        email: m.pessoas?.email || '',
        telefone: m.pessoas?.telefone,
        titulo_profissional: m.pessoas?.titulo_profissional || 'Não informado',
        senioridade: m.pessoas?.senioridade || 'Não informado',
        disponibilidade: m.pessoas?.disponibilidade || 'Não informado',
        modalidade_preferida: m.pessoas?.modalidade_preferida || 'Não informado',
        pretensao_salarial: m.pessoas?.pretensao_salarial || 0,
        score_total: m.score_total,
        score_skills: m.score_skills,
        score_experiencia: m.score_experiencia,
        score_senioridade: m.score_senioridade,
        skills_match: m.skills_match?.items || [],
        skills_faltantes: m.skills_faltantes?.items || [],
        skills_extras: m.skills_extras?.items || [],
        justificativa_ia: m.justificativa_ia || '',
        status: m.status
      }));

      setMatches(resultados);
      return resultados;
    } catch (err: any) {
      console.error('❌ Erro ao carregar matches:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    matches,
    loading,
    error,
    processando,

    // Busca
    buscarPorSkills,
    buscarParaVaga,

    // Matches
    salvarMatch,
    salvarMatchesVaga,
    atualizarStatusMatch,
    carregarMatchesVaga,

    // Candidatura
    criarCandidaturaDoMatch,

    // Utils
    setMatches,
    setError
  };
};
