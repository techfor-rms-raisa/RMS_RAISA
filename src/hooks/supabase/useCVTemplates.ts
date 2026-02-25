/**
 * useCVTemplates.ts - Hook para gerenciamento de Templates de CV
 * 
 * Gerencia a tabela: cv_template
 * 
 * Funcionalidades:
 * - Carregar templates ativos
 * - Criar novo template
 * - Atualizar template existente
 * - Ativar/desativar template
 * 
 * 🔧 v1.1 (25/02/2026): Corrigido erro 406 (.single() → .limit(1) + [0])
 * 
 * Versão: 1.1
 * Data: 25/02/2026
 * Sprint: 1 - Integração Geração de CV
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface CVTemplate {
  id: number;
  nome: string;
  descricao?: string;
  logo_url?: string;
  cor_primaria?: string;
  cor_secundaria?: string;
  fonte?: string;
  secoes?: CVTemplateSecao[];
  template_html?: string;
  template_css?: string;
  ativo: boolean;
  criado_em?: string;
  criado_por?: number;
  metadados?: Record<string, any>;
}

export interface CVTemplateSecao {
  id: string;
  nome: string;
  ordem: number;
  obrigatoria: boolean;
  tipo: 'texto' | 'lista' | 'tabela' | 'experiencias' | 'formacao' | 'idiomas' | 'skills';
  config?: Record<string, any>;
}

export interface CVTemplateInput {
  nome: string;
  descricao?: string;
  logo_url?: string;
  cor_primaria?: string;
  cor_secundaria?: string;
  fonte?: string;
  secoes?: CVTemplateSecao[];
  template_html?: string;
  template_css?: string;
  ativo?: boolean;
  criado_por?: number;
  metadados?: Record<string, any>;
}

// ============================================
// TEMPLATES PADRÃO
// ============================================

const TEMPLATES_PADRAO: Partial<CVTemplate>[] = [
  {
    nome: 'Techfor',
    descricao: 'Template padrão Techfor - Vermelho com requisitos e parecer',
    cor_primaria: '#CC0000',
    cor_secundaria: '#333333',
    fonte: 'Calibri',
    secoes: [
      { id: 'dados', nome: 'Dados Pessoais', ordem: 1, obrigatoria: true, tipo: 'texto' },
      { id: 'requisitos_mand', nome: 'Requisitos Mandatórios', ordem: 2, obrigatoria: true, tipo: 'tabela' },
      { id: 'requisitos_des', nome: 'Requisitos Desejáveis', ordem: 3, obrigatoria: false, tipo: 'tabela' },
      { id: 'hard_skills', nome: 'Hard Skills', ordem: 4, obrigatoria: true, tipo: 'tabela' },
      { id: 'experiencias', nome: 'Experiência Profissional', ordem: 5, obrigatoria: true, tipo: 'experiencias' },
      { id: 'formacao', nome: 'Formação Acadêmica', ordem: 6, obrigatoria: true, tipo: 'formacao' },
      { id: 'cursos', nome: 'Cursos e Certificações', ordem: 7, obrigatoria: false, tipo: 'lista' },
      { id: 'idiomas', nome: 'Idiomas', ordem: 8, obrigatoria: false, tipo: 'idiomas' },
      { id: 'parecer', nome: 'Parecer de Seleção', ordem: 9, obrigatoria: true, tipo: 'texto' }
    ]
  },
  {
    nome: 'T-Systems',
    descricao: 'Template T-Systems - Magenta com capa',
    cor_primaria: '#E20074',
    cor_secundaria: '#666666',
    fonte: 'Calibri',
    secoes: [
      { id: 'capa', nome: 'Capa', ordem: 0, obrigatoria: true, tipo: 'texto' },
      { id: 'dados', nome: 'Dados Pessoais', ordem: 1, obrigatoria: true, tipo: 'texto' },
      { id: 'hard_skills', nome: 'Hard Skills', ordem: 4, obrigatoria: true, tipo: 'tabela' },
      { id: 'experiencias', nome: 'Experiência Profissional', ordem: 5, obrigatoria: true, tipo: 'experiencias' },
      { id: 'formacao', nome: 'Formação Acadêmica', ordem: 6, obrigatoria: true, tipo: 'formacao' },
      { id: 'cursos', nome: 'Cursos e Certificações', ordem: 7, obrigatoria: false, tipo: 'lista' },
      { id: 'idiomas', nome: 'Idiomas', ordem: 8, obrigatoria: false, tipo: 'idiomas' },
      { id: 'parecer', nome: 'Parecer de Seleção', ordem: 9, obrigatoria: true, tipo: 'texto' }
    ]
  }
];

// ============================================
// HOOK
// ============================================

export const useCVTemplates = () => {
  const [templates, setTemplates] = useState<CVTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega todos os templates ativos
   */
  const loadTemplates = useCallback(async (incluirInativos = false): Promise<CVTemplate[]> => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('cv_template')
        .select('*')
        .order('nome', { ascending: true });

      if (!incluirInativos) {
        query = query.eq('ativo', true);
      }

      const { data, error: err } = await query;

      if (err) throw err;

      const mappedTemplates: CVTemplate[] = (data || []).map((t: any) => ({
        id: t.id,
        nome: t.nome,
        descricao: t.descricao,
        logo_url: t.logo_url,
        cor_primaria: t.cor_primaria,
        cor_secundaria: t.cor_secundaria,
        fonte: t.fonte,
        secoes: t.secoes,
        template_html: t.template_html,
        template_css: t.template_css,
        ativo: t.ativo,
        criado_em: t.criado_em,
        criado_por: t.criado_por,
        metadados: t.metadados
      }));

      setTemplates(mappedTemplates);
      console.log(`✅ ${mappedTemplates.length} templates de CV carregados`);
      return mappedTemplates;

    } catch (err: any) {
      console.error('❌ Erro ao carregar templates:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Busca um template por ID
   * 🔧 v1.1: Corrigido .single() → .limit(1) para evitar erro 406
   */
  const getTemplateById = useCallback(async (id: number): Promise<CVTemplate | null> => {
    try {
      const { data, error: err } = await supabase
        .from('cv_template')
        .select('*')
        .eq('id', id)
        .limit(1);

      if (err) throw err;

      return (data && data[0]) ? data[0] as CVTemplate : null;

    } catch (err: any) {
      console.error('❌ Erro ao buscar template:', err);
      return null;
    }
  }, []);

  /**
   * Busca template por nome
   * 🔧 v1.1: Corrigido .single() → .limit(1) para evitar erro 406
   */
  const getTemplateByNome = useCallback(async (nome: string): Promise<CVTemplate | null> => {
    try {
      const { data, error: err } = await supabase
        .from('cv_template')
        .select('*')
        .ilike('nome', `%${nome}%`)
        .eq('ativo', true)
        .limit(1);

      if (err) throw err;

      return (data && data[0]) ? data[0] as CVTemplate : null;

    } catch (err: any) {
      console.error('❌ Erro ao buscar template por nome:', err);
      return null;
    }
  }, []);

  /**
   * Cria um novo template
   */
  const createTemplate = useCallback(async (input: CVTemplateInput): Promise<CVTemplate | null> => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('cv_template')
        .insert({
          nome: input.nome,
          descricao: input.descricao,
          logo_url: input.logo_url,
          cor_primaria: input.cor_primaria,
          cor_secundaria: input.cor_secundaria,
          fonte: input.fonte,
          secoes: input.secoes,
          template_html: input.template_html,
          template_css: input.template_css,
          ativo: input.ativo ?? true,
          criado_por: input.criado_por,
          metadados: input.metadados
        })
        .select()
        .single();

      if (err) throw err;

      const newTemplate = data as CVTemplate;
      setTemplates(prev => [...prev, newTemplate]);
      console.log('✅ Template criado:', newTemplate.nome);

      return newTemplate;

    } catch (err: any) {
      console.error('❌ Erro ao criar template:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Atualiza um template existente
   */
  const updateTemplate = useCallback(async (
    id: number, 
    updates: Partial<CVTemplateInput>
  ): Promise<CVTemplate | null> => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('cv_template')
        .update({
          ...updates,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (err) throw err;

      const updatedTemplate = data as CVTemplate;
      setTemplates(prev => prev.map(t => t.id === id ? updatedTemplate : t));
      console.log('✅ Template atualizado:', updatedTemplate.nome);

      return updatedTemplate;

    } catch (err: any) {
      console.error('❌ Erro ao atualizar template:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Ativa ou desativa um template
   */
  const toggleTemplateAtivo = useCallback(async (id: number, ativo: boolean): Promise<boolean> => {
    try {
      const { error: err } = await supabase
        .from('cv_template')
        .update({ ativo })
        .eq('id', id);

      if (err) throw err;

      setTemplates(prev => prev.map(t => t.id === id ? { ...t, ativo } : t));
      console.log(`✅ Template ${ativo ? 'ativado' : 'desativado'}`);

      return true;

    } catch (err: any) {
      console.error('❌ Erro ao alterar status do template:', err);
      return false;
    }
  }, []);

  /**
   * Inicializa templates padrão se não existirem
   */
  const initializeDefaultTemplates = useCallback(async (userId?: number): Promise<void> => {
    try {
      // Verificar se já existem templates
      const { count, error: countError } = await supabase
        .from('cv_template')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      if (count && count > 0) {
        console.log('📋 Templates já existem, pulando inicialização');
        return;
      }

      console.log('🔧 Inicializando templates padrão...');

      for (const template of TEMPLATES_PADRAO) {
        await createTemplate({
          ...template,
          nome: template.nome!,
          criado_por: userId,
          ativo: true
        });
      }

      console.log('✅ Templates padrão inicializados');

    } catch (err: any) {
      console.error('❌ Erro ao inicializar templates:', err);
    }
  }, [createTemplate]);

  return {
    // Estado
    templates,
    loading,
    error,

    // Métodos de leitura
    loadTemplates,
    getTemplateById,
    getTemplateByNome,

    // Métodos de escrita
    createTemplate,
    updateTemplate,
    toggleTemplateAtivo,

    // Utilitários
    initializeDefaultTemplates,
    TEMPLATES_PADRAO
  };
};
