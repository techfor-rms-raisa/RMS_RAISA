/**
 * useApolloTalentSearch.ts - Hook para busca de candidatos via Apollo
 * 
 * Funcionalidades:
 * - Buscar candidatos via endpoint /api/apollo-talent-search
 * - Carregar vagas abertas para seleção
 * - Extrair filtros automaticamente da vaga selecionada
 * - Gerenciar estado: loading, error, results, pagination
 * - Verificar duplicatas (linkedin_url já no banco de talentos)
 * 
 * Versão: 1.0
 * Data: 03/03/2026
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface ApolloTalentResult {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  headline?: string;
  linkedin_url: string;
  photo_url?: string;
  organization_name?: string;
  organization?: {
    name?: string;
    website_url?: string;
    industry?: string;
    estimated_num_employees?: number;
  };
  city?: string;
  state?: string;
  country?: string;
  seniority?: string;
  ja_importado: boolean;
}

export interface ApolloTalentPagination {
  page: number;
  per_page: number;
  total_entries: number;
  total_pages: number;
}

export interface ApolloTalentSearchFilters {
  person_titles: string[];
  person_seniorities: string[];
  person_locations: string[];
  q_keywords: string;
  organization_num_employees_ranges: string[];
  page: number;
  per_page: number;
}

export interface VagaResumo {
  id: string;
  titulo: string;
  senioridade: string;
  stack_tecnologica: string[];
  status: string;
  cliente_nome?: string;
  modalidade?: string;
  requisitos_obrigatorios?: string[];
}

// Filtros extraídos de uma vaga para alimentar o Apollo
export interface FiltrosExtraidosVaga {
  person_titles: string[];
  person_seniorities: string[];
  q_keywords: string;
  person_locations: string[];
}

// ============================================
// MAPEAMENTO SENIORIDADE → VARIAÇÕES DE TÍTULO
// ============================================

const SENIORITY_TITLE_HINTS: Record<string, string[]> = {
  'Junior': ['Junior', 'Jr', 'Trainee'],
  'Pleno': ['Pleno', 'Mid-level', 'Analyst'],
  'Senior': ['Senior', 'Sr', 'Sênior', 'Lead'],
  'Especialista': ['Specialist', 'Expert', 'Principal', 'Especialista', 'Architect']
};

// ============================================
// HOOK
// ============================================

export function useApolloTalentSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ApolloTalentResult[]>([]);
  const [pagination, setPagination] = useState<ApolloTalentPagination>({
    page: 1, per_page: 25, total_entries: 0, total_pages: 0
  });
  const [vagasAbertas, setVagasAbertas] = useState<VagaResumo[]>([]);
  const [loadingVagas, setLoadingVagas] = useState(false);
  const [filtrosAtuais, setFiltrosAtuais] = useState<ApolloTalentSearchFilters | null>(null);

  // ============================================
  // CARREGAR VAGAS ABERTAS (para o select)
  // ============================================

  const carregarVagasAbertas = useCallback(async (): Promise<VagaResumo[]> => {
    setLoadingVagas(true);
    try {
      const { data, error: queryError } = await supabase
        .from('vagas')
        .select(`
          id,
          titulo,
          senioridade,
          stack_tecnologica,
          status,
          modalidade,
          requisitos_obrigatorios,
          cliente_id,
          clients(razao_social_cliente)
        `)
        .in('status', ['aberta', 'em_andamento'])
        .order('criado_em', { ascending: false });

      if (queryError) throw queryError;

      const vagas: VagaResumo[] = (data || []).map((v: any) => ({
        id: String(v.id),
        titulo: v.titulo,
        senioridade: v.senioridade || 'Pleno',
        stack_tecnologica: v.stack_tecnologica || [],
        status: v.status,
        cliente_nome: v.clients?.razao_social_cliente || '',
        modalidade: v.modalidade,
        requisitos_obrigatorios: v.requisitos_obrigatorios || []
      }));

      setVagasAbertas(vagas);
      return vagas;
    } catch (err: any) {
      console.error('❌ [Apollo Talent] Erro ao carregar vagas:', err);
      return [];
    } finally {
      setLoadingVagas(false);
    }
  }, []);

  // ============================================
  // EXTRAIR FILTROS DE UMA VAGA (PROMPT AUTOMÁTICO)
  // ============================================

  /**
   * Extrai filtros de busca Apollo a partir dos dados da vaga selecionada.
   * 
   * Lógica:
   * - Título da vaga → person_titles (com variações)
   * - Senioridade → person_seniorities (mapeado para Apollo)
   * - Stack tecnológica → q_keywords (skills como palavras-chave)
   * - Default → Brazil como localização
   */
  const extrairFiltrosDaVaga = useCallback((vaga: VagaResumo): FiltrosExtraidosVaga => {
    // 1. TÍTULOS: baseado no título da vaga
    const tituloLimpo = vaga.titulo
      .replace(/\(.*?\)/g, '')  // Remove parênteses e conteúdo
      .replace(/[-–—]/g, ' ')  // Remove hifens/travessões
      .replace(/\s+/g, ' ')    // Normaliza espaços
      .trim();
    
    const person_titles: string[] = [tituloLimpo];
    
    // Adicionar variação com nível de senioridade se não estiver no título
    const hints = SENIORITY_TITLE_HINTS[vaga.senioridade] || [];
    if (hints.length > 0) {
      const tituloLower = tituloLimpo.toLowerCase();
      const jaTemSenioridade = hints.some(h => tituloLower.includes(h.toLowerCase()));
      if (!jaTemSenioridade && hints[0]) {
        person_titles.push(`${hints[0]} ${tituloLimpo}`);
      }
    }

    // 2. SENIORIDADE: direto da vaga
    const person_seniorities: string[] = [vaga.senioridade];

    // 3. KEYWORDS: skills da vaga (max 10 para não poluir a busca)
    const skills = vaga.stack_tecnologica || [];
    const q_keywords = skills.slice(0, 10).join(' ');

    // 4. LOCALIZAÇÃO: default Brasil
    const person_locations: string[] = ['Brazil'];

    return {
      person_titles,
      person_seniorities,
      q_keywords,
      person_locations
    };
  }, []);

  // ============================================
  // BUSCAR CANDIDATOS NO APOLLO
  // ============================================

  const buscarCandidatos = useCallback(async (
    filters: ApolloTalentSearchFilters,
    userId?: number,
    vagaId?: string
  ): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/apollo-talent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...filters,
          user_id: userId,
          vaga_id: vagaId
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Erro ${response.status} ao buscar candidatos`);
      }

      setResults(data.people || []);
      setPagination(data.pagination || {
        page: 1, per_page: 25, total_entries: 0, total_pages: 0
      });
      setFiltrosAtuais(filters);

      console.log(`✅ [Apollo Talent] ${data.people?.length || 0} resultados (total: ${data.pagination?.total_entries || 0})`);

    } catch (err: any) {
      console.error('❌ [Apollo Talent] Erro na busca:', err);
      setError(err.message);
      setResults([]);
      setPagination({ page: 1, per_page: 25, total_entries: 0, total_pages: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // NAVEGAR PÁGINAS
  // ============================================

  const irParaPagina = useCallback(async (
    page: number,
    userId?: number,
    vagaId?: string
  ): Promise<void> => {
    if (!filtrosAtuais) return;
    
    const newFilters = { ...filtrosAtuais, page };
    await buscarCandidatos(newFilters, userId, vagaId);
  }, [filtrosAtuais, buscarCandidatos]);

  // ============================================
  // LIMPAR RESULTADOS
  // ============================================

  const limparResultados = useCallback(() => {
    setResults([]);
    setPagination({ page: 1, per_page: 25, total_entries: 0, total_pages: 0 });
    setError(null);
    setFiltrosAtuais(null);
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    loading,
    error,
    results,
    pagination,
    vagasAbertas,
    loadingVagas,
    filtrosAtuais,
    // Ações
    carregarVagasAbertas,
    extrairFiltrosDaVaga,
    buscarCandidatos,
    irParaPagina,
    limparResultados
  };
}

export default useApolloTalentSearch;
