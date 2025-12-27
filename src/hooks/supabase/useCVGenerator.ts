/**
 * useCVGenerator.ts - Hook para Geração e Gerenciamento de CVs
 * 
 * Gerencia a tabela: cv_gerado
 * 
 * Funcionalidades:
 * - Salvar CV gerado no banco
 * - Carregar CV existente de uma candidatura
 * - Atualizar CV (nova versão)
 * - Aprovar CV para envio
 * - Histórico de versões
 * 
 * Versão: 1.0
 * Data: 27/12/2024
 * Sprint: 1 - Integração Geração de CV
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { DadosCandidatoTechfor } from '@/types/cvTypes';

// ============================================
// TIPOS
// ============================================

export interface CVGerado {
  id: number;
  candidatura_id: number;
  template_id?: number;
  cv_original_url?: string;
  dados_processados: DadosCandidatoTechfor;
  cv_padronizado_url?: string;
  cv_html?: string;
  aprovado: boolean;
  aprovado_por?: number;
  aprovado_em?: string;
  diferencas?: CVDiferencas;
  gerado_em: string;
  gerado_por?: number;
  versao: number;
  metadados?: Record<string, any>;
}

export interface CVDiferencas {
  campos_alterados: string[];
  resumo: string;
  total_alteracoes: number;
}

export interface CVGeradoInput {
  candidatura_id: number;
  template_id?: number;
  cv_original_url?: string;
  dados_processados: DadosCandidatoTechfor;
  cv_padronizado_url?: string;
  cv_html?: string;
  gerado_por?: number;
  metadados?: Record<string, any>;
}

export interface CVGeradoEnriquecido extends CVGerado {
  candidato_nome?: string;
  vaga_titulo?: string;
  template_nome?: string;
}

// ============================================
// HOOK
// ============================================

export const useCVGenerator = () => {
  const [cvAtual, setCvAtual] = useState<CVGerado | null>(null);
  const [historicoVersoes, setHistoricoVersoes] = useState<CVGerado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega CV existente de uma candidatura
   */
  const loadCVByCandidatura = useCallback(async (candidaturaId: number): Promise<CVGerado | null> => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('cv_gerado')
        .select('*')
        .eq('candidatura_id', candidaturaId)
        .order('versao', { ascending: false })
        .limit(1)
        .single();

      if (err && err.code !== 'PGRST116') throw err;

      if (data) {
        const cv = mapCVFromDB(data);
        setCvAtual(cv);
        console.log(`✅ CV carregado (versão ${cv.versao})`);
        return cv;
      }

      setCvAtual(null);
      return null;

    } catch (err: any) {
      console.error('❌ Erro ao carregar CV:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Carrega histórico de versões de CV de uma candidatura
   */
  const loadHistoricoVersoes = useCallback(async (candidaturaId: number): Promise<CVGerado[]> => {
    try {
      setLoading(true);

      const { data, error: err } = await supabase
        .from('cv_gerado')
        .select('*')
        .eq('candidatura_id', candidaturaId)
        .order('versao', { ascending: false });

      if (err) throw err;

      const versoes = (data || []).map(mapCVFromDB);
      setHistoricoVersoes(versoes);
      console.log(`✅ ${versoes.length} versões de CV carregadas`);

      return versoes;

    } catch (err: any) {
      console.error('❌ Erro ao carregar histórico:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Salva um novo CV ou cria nova versão
   */
  const saveCV = useCallback(async (input: CVGeradoInput): Promise<CVGerado | null> => {
    try {
      setLoading(true);
      setError(null);

      // Verificar se já existe CV para esta candidatura
      const { data: existente, error: checkError } = await supabase
        .from('cv_gerado')
        .select('versao')
        .eq('candidatura_id', input.candidatura_id)
        .order('versao', { ascending: false })
        .limit(1)
        .single();

      if (checkError && checkError.code !== 'PGRST116') throw checkError;

      const novaVersao = existente ? existente.versao + 1 : 1;

      // Calcular diferenças se for atualização
      let diferencas: CVDiferencas | null = null;
      if (existente && cvAtual) {
        diferencas = calcularDiferencas(cvAtual.dados_processados, input.dados_processados);
      }

      // Inserir novo CV
      const { data, error: insertError } = await supabase
        .from('cv_gerado')
        .insert({
          candidatura_id: input.candidatura_id,
          template_id: input.template_id,
          cv_original_url: input.cv_original_url,
          dados_processados: input.dados_processados,
          cv_padronizado_url: input.cv_padronizado_url,
          cv_html: input.cv_html,
          aprovado: false,
          gerado_por: input.gerado_por,
          versao: novaVersao,
          diferencas: diferencas,
          metadados: input.metadados
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const cvSalvo = mapCVFromDB(data);
      setCvAtual(cvSalvo);
      
      console.log(`✅ CV salvo (versão ${novaVersao})`);
      return cvSalvo;

    } catch (err: any) {
      console.error('❌ Erro ao salvar CV:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [cvAtual]);

  /**
   * Atualiza dados de um CV existente (incrementa versão)
   */
  const updateCV = useCallback(async (
    cvId: number,
    dados: Partial<CVGeradoInput>
  ): Promise<CVGerado | null> => {
    try {
      setLoading(true);
      setError(null);

      // Buscar CV atual para saber a candidatura_id
      const { data: cvExistente, error: fetchError } = await supabase
        .from('cv_gerado')
        .select('*')
        .eq('id', cvId)
        .single();

      if (fetchError) throw fetchError;

      // Criar nova versão em vez de atualizar in-place
      const novoCV = await saveCV({
        candidatura_id: cvExistente.candidatura_id,
        template_id: dados.template_id ?? cvExistente.template_id,
        cv_original_url: dados.cv_original_url ?? cvExistente.cv_original_url,
        dados_processados: dados.dados_processados ?? cvExistente.dados_processados,
        cv_padronizado_url: dados.cv_padronizado_url,
        cv_html: dados.cv_html,
        gerado_por: dados.gerado_por,
        metadados: dados.metadados
      });

      return novoCV;

    } catch (err: any) {
      console.error('❌ Erro ao atualizar CV:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [saveCV]);

  /**
   * Aprova um CV para envio ao cliente
   */
  const aprovarCV = useCallback(async (cvId: number, aprovadoPor: number): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('cv_gerado')
        .update({
          aprovado: true,
          aprovado_por: aprovadoPor,
          aprovado_em: new Date().toISOString()
        })
        .eq('id', cvId)
        .select()
        .single();

      if (err) throw err;

      const cvAprovado = mapCVFromDB(data);
      setCvAtual(cvAprovado);
      
      console.log('✅ CV aprovado para envio');
      return true;

    } catch (err: any) {
      console.error('❌ Erro ao aprovar CV:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Revoga aprovação de um CV
   */
  const revogarAprovacao = useCallback(async (cvId: number): Promise<boolean> => {
    try {
      const { error: err } = await supabase
        .from('cv_gerado')
        .update({
          aprovado: false,
          aprovado_por: null,
          aprovado_em: null
        })
        .eq('id', cvId);

      if (err) throw err;

      if (cvAtual?.id === cvId) {
        setCvAtual(prev => prev ? { ...prev, aprovado: false, aprovado_por: undefined, aprovado_em: undefined } : null);
      }

      console.log('✅ Aprovação revogada');
      return true;

    } catch (err: any) {
      console.error('❌ Erro ao revogar aprovação:', err);
      return false;
    }
  }, [cvAtual]);

  /**
   * Busca CVs por filtros
   */
  const searchCVs = useCallback(async (filtros: {
    aprovado?: boolean;
    template_id?: number;
    gerado_por?: number;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<CVGeradoEnriquecido[]> => {
    try {
      setLoading(true);

      let query = supabase
        .from('cv_gerado')
        .select(`
          *,
          candidaturas!inner(
            candidato_nome,
            vagas!inner(titulo)
          ),
          cv_template(nome)
        `)
        .order('gerado_em', { ascending: false });

      if (filtros.aprovado !== undefined) {
        query = query.eq('aprovado', filtros.aprovado);
      }
      if (filtros.template_id) {
        query = query.eq('template_id', filtros.template_id);
      }
      if (filtros.gerado_por) {
        query = query.eq('gerado_por', filtros.gerado_por);
      }
      if (filtros.data_inicio) {
        query = query.gte('gerado_em', filtros.data_inicio);
      }
      if (filtros.data_fim) {
        query = query.lte('gerado_em', filtros.data_fim);
      }

      const { data, error: err } = await query;

      if (err) throw err;

      const cvs: CVGeradoEnriquecido[] = (data || []).map((cv: any) => ({
        ...mapCVFromDB(cv),
        candidato_nome: cv.candidaturas?.candidato_nome,
        vaga_titulo: cv.candidaturas?.vagas?.titulo,
        template_nome: cv.cv_template?.nome
      }));

      return cvs;

    } catch (err: any) {
      console.error('❌ Erro ao buscar CVs:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Retorna estatísticas de CVs gerados
   */
  const getEstatisticas = useCallback(async (): Promise<{
    total: number;
    aprovados: number;
    pendentes: number;
    porTemplate: Record<string, number>;
  }> => {
    try {
      const { data, error: err } = await supabase
        .from('cv_gerado')
        .select(`
          id,
          aprovado,
          cv_template(nome)
        `);

      if (err) throw err;

      const cvs = data || [];
      const porTemplate: Record<string, number> = {};

      cvs.forEach((cv: any) => {
        const templateNome = cv.cv_template?.nome || 'Sem template';
        porTemplate[templateNome] = (porTemplate[templateNome] || 0) + 1;
      });

      return {
        total: cvs.length,
        aprovados: cvs.filter((cv: any) => cv.aprovado).length,
        pendentes: cvs.filter((cv: any) => !cv.aprovado).length,
        porTemplate
      };

    } catch (err: any) {
      console.error('❌ Erro ao buscar estatísticas:', err);
      return {
        total: 0,
        aprovados: 0,
        pendentes: 0,
        porTemplate: {}
      };
    }
  }, []);

  return {
    // Estado
    cvAtual,
    historicoVersoes,
    loading,
    error,

    // Métodos de leitura
    loadCVByCandidatura,
    loadHistoricoVersoes,
    searchCVs,
    getEstatisticas,

    // Métodos de escrita
    saveCV,
    updateCV,
    aprovarCV,
    revogarAprovacao,

    // Utilitários
    setCvAtual
  };
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Mapeia dados do banco para o tipo CVGerado
 */
function mapCVFromDB(data: any): CVGerado {
  return {
    id: data.id,
    candidatura_id: data.candidatura_id,
    template_id: data.template_id,
    cv_original_url: data.cv_original_url,
    dados_processados: data.dados_processados,
    cv_padronizado_url: data.cv_padronizado_url,
    cv_html: data.cv_html,
    aprovado: data.aprovado,
    aprovado_por: data.aprovado_por,
    aprovado_em: data.aprovado_em,
    diferencas: data.diferencas,
    gerado_em: data.gerado_em,
    gerado_por: data.gerado_por,
    versao: data.versao,
    metadados: data.metadados
  };
}

/**
 * Calcula diferenças entre duas versões de dados
 */
function calcularDiferencas(
  anterior: DadosCandidatoTechfor,
  novo: DadosCandidatoTechfor
): CVDiferencas {
  const camposAlterados: string[] = [];

  // Comparar campos simples
  const camposSimples: (keyof DadosCandidatoTechfor)[] = [
    'nome', 'email', 'telefone', 'endereco', 'cidade', 'estado',
    'nacionalidade', 'estado_civil', 'data_nascimento', 'idade',
    'resumo_profissional', 'parecer_selecao', 'recomendacao_final',
    'titulo_vaga', 'codigo_vaga', 'cliente_destino', 'gestor_destino'
  ];

  camposSimples.forEach(campo => {
    if (anterior[campo] !== novo[campo]) {
      camposAlterados.push(campo);
    }
  });

  // Comparar arrays
  if (JSON.stringify(anterior.experiencias) !== JSON.stringify(novo.experiencias)) {
    camposAlterados.push('experiencias');
  }
  if (JSON.stringify(anterior.formacao_academica) !== JSON.stringify(novo.formacao_academica)) {
    camposAlterados.push('formacao_academica');
  }
  if (JSON.stringify(anterior.hard_skills_tabela) !== JSON.stringify(novo.hard_skills_tabela)) {
    camposAlterados.push('hard_skills');
  }
  if (JSON.stringify(anterior.idiomas) !== JSON.stringify(novo.idiomas)) {
    camposAlterados.push('idiomas');
  }
  if (JSON.stringify(anterior.requisitos_match) !== JSON.stringify(novo.requisitos_match)) {
    camposAlterados.push('requisitos_match');
  }

  return {
    campos_alterados: camposAlterados,
    resumo: camposAlterados.length > 0 
      ? `${camposAlterados.length} campo(s) alterado(s): ${camposAlterados.slice(0, 3).join(', ')}${camposAlterados.length > 3 ? '...' : ''}`
      : 'Nenhuma alteração',
    total_alteracoes: camposAlterados.length
  };
}
