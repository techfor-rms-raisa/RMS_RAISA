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
import { supabase } from '@/config/supabase';
import { Vaga, Pessoa } from '@/types';
import matchingInteligenteService, { 
  calcularScoreCompatibilidade, 
  filtrarERankearCandidatos,
  ScoreDetalhado 
} from '@/services/matchingInteligenteService';

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
   * 🆕 v3.0: Usa função RPC otimizada com normalização no banco
   */
  const buscarPorSkills = useCallback(async (
    skills: string[],
    filtros?: Omit<BuscaFiltros, 'skills'>
  ): Promise<CandidatoMatch[]> => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🔍 Buscando candidatos por skills: ${skills.join(', ')}`);

      // 🆕 v3.0: Tentar usar função RPC otimizada com normalização
      const { data, error: rpcError } = await supabase.rpc('buscar_candidatos_normalizado', {
        p_skills: skills,
        p_senioridade: filtros?.senioridade || null,
        p_limite: filtros?.limite || 20
      });

      if (!rpcError && data) {
        console.log('✅ Usando busca otimizada via RPC (normalização no banco)');
        const resultados: CandidatoMatch[] = (data || []).map((r: any) => ({
          pessoa_id: r.pessoa_id,
          nome: r.nome,
          email: r.email,
          telefone: r.telefone,
          titulo_profissional: r.titulo_profissional || 'Não informado',
          senioridade: r.senioridade || 'Não informado',
          disponibilidade: r.disponibilidade || 'Não informado',
          modalidade_preferida: r.modalidade_preferida || 'Não informado',
          pretensao_salarial: r.pretensao_salarial || 0,
          score_total: r.score_match || 0,
          score_skills: r.score_match || 0,
          score_experiencia: 0,
          score_senioridade: 0,
          skills_match: r.skills_match || [],
          skills_faltantes: r.skills_faltantes || [],
          skills_extras: [],
          justificativa_ia: '',
          status: 'novo',
          top_skills: (r.skills_match || []).slice(0, 5),
          anos_experiencia_total: r.anos_experiencia_total || 0  // 🆕 v4.0: Anos de experiência
        }));

        setMatches(resultados);
        console.log(`✅ ${resultados.length} candidatos encontrados via RPC otimizada`);
        return resultados;
      }

      // Fallback: usar busca com normalização no frontend
      console.warn('⚠️ RPC buscar_candidatos_normalizado não disponível, usando busca alternativa...');
      return await buscarPorSkillsComSinonimos(skills, filtros);
      
    } catch (err: any) {
      console.error('❌ Erro na busca:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 🆕 Normaliza skill para comparação (remove espaços, acentos, lowercase)
   */
  const normalizarSkill = (skill: string): string => {
    return (skill || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/\s+/g, '') // Remove espaços
      .replace(/[^a-z0-9]/g, ''); // Remove caracteres especiais
  };

  /**
   * Busca com sinônimos (fallback quando RPC não disponível)
   * 🆕 v2.0: Normalização melhorada para match de skills
   */
  const buscarPorSkillsComSinonimos = async (
    skills: string[],
    filtros?: Omit<BuscaFiltros, 'skills'>
  ): Promise<CandidatoMatch[]> => {
    try {
      console.log('🔄 Usando busca com sinônimos (v2.0)...');
      console.log(`📋 Skills da vaga: ${skills.join(', ')}`);
      
      // 1. Normalizar skills da vaga
      const skillsNormalizadas = new Set<string>();
      const skillsOriginais = new Map<string, string>(); // normalizada -> original
      
      skills.forEach(s => {
        const normalizada = normalizarSkill(s);
        skillsNormalizadas.add(normalizada);
        skillsOriginais.set(normalizada, s);
      });
      
      console.log(`📋 Skills normalizadas: ${Array.from(skillsNormalizadas).join(', ')}`);
      
      // 🔍 DEBUG: Mostrar tamanho do set de skills normalizadas
      console.log(`📋 Total skills normalizadas para busca: ${skillsNormalizadas.size}`);

      // 2. Buscar sinônimos para expandir a busca
      const { data: sinonimosData } = await supabase
        .from('skill_sinonimos')
        .select('skill_canonica, sinonimo');
      
      // Criar mapa de sinônimos (normalizado)
      const sinonimosMap = new Map<string, string>();
      (sinonimosData || []).forEach((s: any) => {
        const sinonNorm = normalizarSkill(s.sinonimo);
        const canonNorm = normalizarSkill(s.skill_canonica);
        sinonimosMap.set(sinonNorm, s.skill_canonica);
        // Adicionar variações ao conjunto de busca
        if (skillsNormalizadas.has(canonNorm) || skillsNormalizadas.has(sinonNorm)) {
          skillsNormalizadas.add(sinonNorm);
          skillsNormalizadas.add(canonNorm);
        }
      });
      
      // 3. Buscar TODAS as skills de pessoas (aumentar limite para pegar todos)
      const { data: skillsData, error: skillsError } = await supabase
        .from('pessoa_skills')
        .select('pessoa_id, skill_nome, nivel, anos_experiencia')
        .limit(10000); // 🆕 Aumentar limite para pegar todas as skills

      if (skillsError) {
        console.warn('⚠️ Erro ao buscar pessoa_skills:', skillsError);
        return await buscarEmPessoas(skills, filtros);
      }

      console.log(`📊 Total de skills no banco: ${(skillsData || []).length}`);

      // 4. Filtrar skills que batem (comparação normalizada)
      const skillsMatch = (skillsData || []).filter((s: any) => {
        const skillNorm = normalizarSkill(s.skill_nome);
        return skillsNormalizadas.has(skillNorm);
      });

      console.log(`✅ Skills com match: ${skillsMatch.length}`);
      
      // 🔍 DEBUG: Ver quais skills do Hugo foram encontradas
      const hugoSkillsNoBanco = (skillsData || []).filter((s: any) => s.pessoa_id === 58);
      console.log(`🔍 Skills do HUGO (ID 58) no banco: ${hugoSkillsNoBanco.length}`);
      hugoSkillsNoBanco.forEach((s: any) => {
        const norm = normalizarSkill(s.skill_nome);
        const match = skillsNormalizadas.has(norm);
        console.log(`   - "${s.skill_nome}" -> "${norm}" ${match ? '✅ MATCH' : '❌ NO MATCH'}`);
      });

      // 5. Agrupar por pessoa
      const pessoaSkillsMap = new Map<number, { skills: string[], skillsOriginais: string[], anos: number }>();
      skillsMatch.forEach((s: any) => {
        const current = pessoaSkillsMap.get(s.pessoa_id) || { skills: [], skillsOriginais: [], anos: 0 };
        const skillNorm = normalizarSkill(s.skill_nome);
        
        if (!current.skills.includes(skillNorm)) {
          current.skills.push(skillNorm);
          current.skillsOriginais.push(s.skill_nome);
        }
        current.anos += s.anos_experiencia || 0;
        pessoaSkillsMap.set(s.pessoa_id, current);
      });

      console.log(`👥 Pessoas com matches: ${pessoaSkillsMap.size}`);
      
      // 🔍 DEBUG: Ver todas as pessoas e suas skills
      console.log('📊 DEBUG - Top 15 pessoas por quantidade de skills:');
      const debugPessoas = Array.from(pessoaSkillsMap.entries())
        .sort((a, b) => b[1].skills.length - a[1].skills.length)
        .slice(0, 15);
      debugPessoas.forEach(([id, data]) => {
        console.log(`   ID ${id}: ${data.skills.length} skills - [${data.skillsOriginais.join(', ')}]`);
      });
      
      // 🔍 DEBUG: Verificar especificamente o Hugo (ID 58)
      const hugoData = pessoaSkillsMap.get(58);
      if (hugoData) {
        console.log(`🔍 HUGO (ID 58) encontrado: ${hugoData.skills.length} skills - [${hugoData.skillsOriginais.join(', ')}]`);
      } else {
        console.log('❌ HUGO (ID 58) NÃO está no mapa de matches!');
      }

      // 6. Ordenar por quantidade de matches
      const pessoasOrdenadas = Array.from(pessoaSkillsMap.entries())
        .sort((a, b) => b[1].skills.length - a[1].skills.length)
        .slice(0, filtros?.limite || 20);

      if (pessoasOrdenadas.length === 0) {
        console.log('⚠️ Nenhum candidato encontrado com as skills solicitadas');
        return [];
      }

      // 7. Buscar dados completos das pessoas
      const pessoaIds = pessoasOrdenadas.map(([id]) => id);
      
      let query = supabase
        .from('pessoas')
        .select('*')
        .in('id', pessoaIds);

      if (filtros?.senioridade) {
        query = query.eq('senioridade', filtros.senioridade);
      }
      if (filtros?.disponibilidade) {
        query = query.eq('disponibilidade', filtros.disponibilidade);
      }

      const { data: pessoasData, error: pessoasError } = await query;

      if (pessoasError) throw pessoasError;

      // 8. Montar resultados
      const skillsOriginaisList = skills; // Lista original da vaga
      
      const resultados: CandidatoMatch[] = (pessoasData || []).map((p: any) => {
        const dadosMatch = pessoaSkillsMap.get(p.id) || { skills: [], skillsOriginais: [], anos: 0 };
        const skillsEncontradas = dadosMatch.skillsOriginais; // Usar nomes originais para exibição
        
        // Calcular skills faltantes (comparando normalizado)
        const skillsNormEncontradas = dadosMatch.skills;
        const skillsFaltantes = skillsOriginaisList.filter(s => 
          !skillsNormEncontradas.includes(normalizarSkill(s))
        );
        
        const scoreMatch = Math.round((skillsNormEncontradas.length / skills.length) * 100);

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
          skills_match: skillsEncontradas,
          skills_faltantes: skillsFaltantes,
          skills_extras: [],
          justificativa_ia: '',
          status: 'novo' as const,
          top_skills: skillsEncontradas.slice(0, 5),
          anos_experiencia_total: dadosMatch.anos
        };
      });

      // Ordenar por score
      resultados.sort((a, b) => b.score_total - a.score_total);
      
      console.log(`✅ ${resultados.length} candidatos encontrados com sinônimos`);
      return resultados;
    } catch (err: any) {
      console.error('❌ Erro na busca com sinônimos:', err);
      return await buscarEmPessoas(skills, filtros);
    }
  };

  /**
   * Busca alternativa quando RPC não está disponível (LEGADO)
   */
  const buscarPorSkillsAlternativo = async (
    skills: string[],
    filtros?: Omit<BuscaFiltros, 'skills'>
  ): Promise<CandidatoMatch[]> => {
    // Redirecionar para busca com sinônimos
    return buscarPorSkillsComSinonimos(skills, filtros);
  };

  /**
   * Busca em pessoas (fallback final quando não há tabela pessoa_skills)
   */
  const buscarEmPessoas = async (
    skills: string[],
    filtros?: Omit<BuscaFiltros, 'skills'>
  ): Promise<CandidatoMatch[]> => {
    try {
      console.log('🔄 Usando busca em cv_texto_original...');
      
      // Buscar pessoas que têm skills correspondentes
      const skillsLower = skills.map(s => s.toLowerCase());
      
      const { data: skillsData, error: skillsError } = await supabase
        .from('pessoa_skills')
        .select('pessoa_id, skill_nome')
        .in('skill_nome', skillsLower);

      if (skillsError) {
        // Se tabela não existe, buscar direto em pessoas
        console.warn('⚠️ Tabela pessoa_skills não encontrada, buscando em pessoas...');
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
        .in('id', pessoaIds);

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
          status: 'novo' as const,
          top_skills: skillsMatch.slice(0, 5)
        };
      });

      return resultados;
    } catch (err: any) {
      console.error('❌ Erro na busca em pessoas:', err);
      return [];
    }
  };

  // ============================================
  // BUSCA PARA UMA VAGA ESPECÍFICA
  // ============================================

  /**
   * Busca candidatos aderentes a uma vaga específica
   * 🆕 v4.0: Usa matching inteligente com validação de função/área
   */
  const buscarParaVaga = useCallback(async (
    vaga: Vaga,
    limite: number = 20
  ): Promise<CandidatoMatch[]> => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🎯 Buscando candidatos para vaga: ${vaga.titulo}`);
      console.log(`📋 Stack tecnológica: ${JSON.stringify(vaga.stack_tecnologica)}`);

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

      // 🆕 v4.0: Detectar área da vaga para filtro inteligente
      const areaVaga = matchingInteligenteService.detectarAreaAtuacao(vaga.titulo, skills);
      console.log(`🎯 Área detectada da vaga: ${areaVaga}`);

      // Buscar candidatos base (todas as pessoas com skills)
      const resultadosBase = await buscarPorSkills(skills, { limite: limite * 3 }); // Buscar mais para filtrar depois
      
      console.log(`📊 Candidatos base encontrados: ${resultadosBase.length}`);

      // 🆕 v4.0: Aplicar matching inteligente com validação de função
      const candidatosParaAnalise = resultadosBase.map(r => ({
        pessoa_id: r.pessoa_id,
        nome: r.nome,
        titulo_profissional: r.titulo_profissional,
        skills: r.skills_match, // Skills que o candidato tem
        senioridade: r.senioridade,
        // Passar outros dados para preservar
        email: r.email,
        telefone: r.telefone,
        disponibilidade: r.disponibilidade,
        modalidade_preferida: r.modalidade_preferida,
        pretensao_salarial: r.pretensao_salarial,
        skills_extras: r.skills_extras,
        status: r.status,
        top_skills: r.top_skills,
        anos_experiencia_total: r.anos_experiencia_total
      }));

      // Aplicar filtro inteligente
      const resultadosFiltrados = filtrarERankearCandidatos(
        candidatosParaAnalise,
        {
          titulo: vaga.titulo,
          stack_tecnologica: skills,
          senioridade: vaga.senioridade
        },
        {
          scoreMinimo: 25, // Mínimo 25% para aparecer
          incluirIncompativeis: false,
          limite
        }
      );

      console.log(`✅ Candidatos após filtro inteligente: ${resultadosFiltrados.length}`);

      // Log dos candidatos filtrados para debug
      resultadosFiltrados.slice(0, 5).forEach((r, idx) => {
        console.log(`   ${idx + 1}. ${r.candidato.nome} (${r.candidato.titulo_profissional})`);
        console.log(`      Área: ${r.score.area_candidato} | Score: ${r.score.score_total}%`);
        console.log(`      Core: ${r.score.score_core}% | Func: ${r.score.score_funcao}%`);
        if (r.score.skills_core_faltantes.length > 0) {
          console.log(`      ⚠️ Skills core faltantes: ${r.score.skills_core_faltantes.join(', ')}`);
        }
      });

      // Transformar resultados para o formato CandidatoMatch
      const resultadosCompletos: CandidatoMatch[] = resultadosFiltrados.map(({ candidato, score }) => {
        // Calcular score de senioridade
        const normalizarSenioridade = (s: string) => 
          (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        const vagaSenioridade = normalizarSenioridade(vaga.senioridade);
        const candidatoSenioridade = normalizarSenioridade(candidato.senioridade || '');
        
        let scoreSenioridade = 50;
        if (candidatoSenioridade === vagaSenioridade || 
            candidatoSenioridade.includes(vagaSenioridade) ||
            vagaSenioridade.includes(candidatoSenioridade)) {
          scoreSenioridade = 100;
        }
        if (vagaSenioridade === 'senior' && candidatoSenioridade === 'especialista') {
          scoreSenioridade = 100;
        }

        // Bonus por disponibilidade
        let bonusDisponibilidade = 0;
        if (candidato.disponibilidade === 'imediata') {
          bonusDisponibilidade = 3;
        }

        // Score total ajustado
        const scoreAjustado = Math.min(100, score.score_total + bonusDisponibilidade);

        return {
          pessoa_id: candidato.pessoa_id,
          nome: candidato.nome,
          email: candidato.email || '',
          telefone: candidato.telefone,
          titulo_profissional: candidato.titulo_profissional || 'Não informado',
          senioridade: candidato.senioridade || 'Não informado',
          disponibilidade: candidato.disponibilidade || 'Não informado',
          modalidade_preferida: candidato.modalidade_preferida || 'Não informado',
          pretensao_salarial: candidato.pretensao_salarial || 0,
          score_total: scoreAjustado,
          score_skills: score.score_core,
          score_experiencia: score.score_obrigatorias,
          score_senioridade: scoreSenioridade,
          skills_match: [...score.skills_core_atendidas, ...score.skills_obrig_atendidas],
          skills_faltantes: score.skills_core_faltantes,
          skills_extras: candidato.skills_extras || [],
          justificativa_ia: score.motivo_incompatibilidade || 
            `Área: ${score.area_candidato} | Score Função: ${score.score_funcao}% | Score Core: ${score.score_core}%`,
          status: candidato.status || 'novo',
          top_skills: score.skills_core_atendidas.slice(0, 5),
          anos_experiencia_total: candidato.anos_experiencia_total || 0
        };
      });

      // Ordenar por score total
      resultadosCompletos.sort((a, b) => b.score_total - a.score_total);

      setMatches(resultadosCompletos);
      console.log(`✅ ${resultadosCompletos.length} candidatos finais para a vaga`);
      
      // Log dos candidatos EXCLUÍDOS para análise
      const excluidos = candidatosParaAnalise.length - resultadosFiltrados.length;
      if (excluidos > 0) {
        console.log(`🚫 ${excluidos} candidatos excluídos por incompatibilidade de função/área`);
      }
      
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
    pessoaId: number,
    vagaId: string,
    analistaId: number,
    dadosIndicacao?: {
      origem?: 'aquisicao' | 'indicacao_cliente';
      indicado_por_nome?: string;
      indicado_por_cargo?: string;
      indicacao_observacoes?: string;
    }
  ): Promise<{ id: string } | null> => {
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

      // Determinar status inicial baseado na origem
      const statusInicial = dadosIndicacao?.origem === 'indicacao_cliente' 
        ? 'indicacao_aprovada'  // Indicações vão direto para aprovação
        : 'triagem';           // Aquisições passam por triagem normal

      // Criar candidatura
      const candidaturaData = {
        vaga_id: parseInt(vagaId),
        pessoa_id: pessoaId,
        candidato_nome: pessoa.nome,
        candidato_email: pessoa.email,
        candidato_cpf: pessoa.cpf,
        analista_id: analistaId,
        status: statusInicial,
        cv_url: pessoa.curriculo_url,
        curriculo_texto: pessoa.cv_texto_completo,
        observacoes: dadosIndicacao?.origem === 'indicacao_cliente' 
          ? 'Candidatura criada via indicação do cliente' 
          : 'Candidatura criada via busca inteligente de CVs',
        criado_em: new Date().toISOString(),
        // Campos de indicação
        origem: dadosIndicacao?.origem || 'aquisicao',
        indicado_por_nome: dadosIndicacao?.indicado_por_nome || null,
        indicado_por_cargo: dadosIndicacao?.indicado_por_cargo || null,
        indicacao_data: dadosIndicacao?.origem === 'indicacao_cliente' ? new Date().toISOString().split('T')[0] : null,
        indicacao_observacoes: dadosIndicacao?.indicacao_observacoes || null
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
        .eq('vaga_id', parseInt(vagaId))
        .eq('pessoa_id', pessoaId);

      console.log(`✅ Candidatura criada: ID ${candidatura.id} (${dadosIndicacao?.origem === 'indicacao_cliente' ? 'INDICAÇÃO' : 'AQUISIÇÃO'})`);
      return { id: String(candidatura.id) };
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

