/**
 * useTemplates Hook - Gerenciamento de Templates de Email
 * Módulo separado do useSupabaseData para melhor organização
 */

import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { EmailTemplate } from '@/types';

export const useTemplates = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega todos os templates de email
   */
  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedTemplates: EmailTemplate[] = (data || []).map((template: any) => ({
        id: template.id,
        name: template.name,
        subject: template.subject,
        body: template.body,
        context: template.context,
        status: template.status,
        created_at: template.created_at,
        updated_at: template.updated_at
      }));

      setTemplates(mappedTemplates);
      console.log(`✅ ${mappedTemplates.length} templates carregados`);
      return mappedTemplates;
    } catch (err: any) {
      console.error('❌ Erro ao carregar templates:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Adiciona um novo template
   */
  const addTemplate = async (newTemplate: Omit<EmailTemplate, 'id'>) => {
    try {
      console.log('➕ Criando template:', newTemplate);

      const { data, error } = await supabase
        .from('email_templates')
        .insert([{
          name: newTemplate.name,
          subject: newTemplate.subject,
          body: newTemplate.body,
          context: newTemplate.context,
          status: newTemplate.status || 'rascunho'
        }])
        .select()
        .single();

      if (error) throw error;

      const createdTemplate: EmailTemplate = {
        id: data.id,
        name: data.name,
        subject: data.subject,
        body: data.body,
        context: data.context,
        status: data.status,
        created_at: data.created_at,
        updated_at: data.updated_at
      };

      setTemplates(prev => [createdTemplate, ...prev]);
      console.log('✅ Template criado:', createdTemplate);
      
      return createdTemplate;
    } catch (err: any) {
      console.error('❌ Erro ao criar template:', err);
      alert(`Erro ao criar template: ${err.message}`);
      throw err;
    }
  };

  /**
   * Atualiza um template existente
   */
  const updateTemplate = async (id: string, updates: Partial<EmailTemplate>) => {
    try {
      console.log('📝 Atualizando template:', id, updates);

      const { data, error } = await supabase
        .from('email_templates')
        .update({
          name: updates.name,
          subject: updates.subject,
          body: updates.body,
          context: updates.context,
          status: updates.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedTemplate: EmailTemplate = {
        id: data.id,
        name: data.name,
        subject: data.subject,
        body: data.body,
        context: data.context,
        status: data.status,
        created_at: data.created_at,
        updated_at: data.updated_at
      };

      setTemplates(prev => prev.map(t => t.id === id ? updatedTemplate : t));
      console.log('✅ Template atualizado:', updatedTemplate);
      
      return updatedTemplate;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar template:', err);
      alert(`Erro ao atualizar template: ${err.message}`);
      throw err;
    }
  };

  /**
   * Deleta um template
   */
  const deleteTemplate = async (id: string) => {
    try {
      console.log('🗑️ Deletando template:', id);

      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTemplates(prev => prev.filter(t => t.id !== id));
      console.log('✅ Template deletado');
    } catch (err: any) {
      console.error('❌ Erro ao deletar template:', err);
      alert(`Erro ao deletar template: ${err.message}`);
      throw err;
    }
  };

  return {
    templates,
    setTemplates,
    loading,
    error,
    loadTemplates,
    addTemplate,
    updateTemplate,
    deleteTemplate
  };
};
