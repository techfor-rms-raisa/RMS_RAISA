/**
 * useConsultants Hook - Gerenciamento de Consultores
 * Módulo separado do useSupabaseData para melhor organização
 * Inclui lazy loading de relatórios
 */

import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { Consultant, ConsultantReport } from '@/types';

export const useConsultants = () => {
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega todos os consultores (SEM relatórios - usar lazy loading)
   */
  const loadConsultants = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('consultants')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      // ⚠️ NÃO CARREGAR RELATÓRIOS AQUI - USAR LAZY LOADING
      const mappedConsultants: Consultant[] = (data || []).map((consultant: any) => ({
        id: consultant.id,
        nome_consultores: consultant.nome_consultores,
        email_consultor: consultant.email_consultor,
        celular: consultant.celular,
        cpf: consultant.cpf,
        cargo_consultores: consultant.cargo_consultores,
        ano_vigencia: consultant.ano_vigencia,
        data_inclusao_consultores: consultant.data_inclusao_consultores,
        data_ultima_alteracao: consultant.data_ultima_alteracao,
        data_saida: consultant.data_saida,
        status: consultant.status,
        motivo_desligamento: consultant.motivo_desligamento,
        valor_faturamento: consultant.valor_faturamento,
        valor_pagamento: consultant.valor_pagamento,
        gestor_imediato_id: consultant.gestor_imediato_id,
        coordenador_id: consultant.coordenador_id,
        analista_rs_id: consultant.analista_rs_id,
        id_gestao_de_pessoas: consultant.id_gestao_de_pessoas,
        parecer_1_consultor: consultant.parecer_1_consultor,
        parecer_2_consultor: consultant.parecer_2_consultor,
        parecer_3_consultor: consultant.parecer_3_consultor,
        parecer_4_consultor: consultant.parecer_4_consultor,
        parecer_5_consultor: consultant.parecer_5_consultor,
        parecer_6_consultor: consultant.parecer_6_consultor,
        parecer_7_consultor: consultant.parecer_7_consultor,
        parecer_8_consultor: consultant.parecer_8_consultor,
        parecer_9_consultor: consultant.parecer_9_consultor,
        parecer_10_consultor: consultant.parecer_10_consultor,
        parecer_11_consultor: consultant.parecer_11_consultor,
        parecer_12_consultor: consultant.parecer_12_consultor,
        parecer_final_consultor: consultant.parecer_final_consultor,
        reports: [],
        consultant_reports: [] // Será carregado sob demanda
      }));

      setConsultants(mappedConsultants);
      console.log(`✅ ${mappedConsultants.length} consultores carregados`);
      return mappedConsultants;
    } catch (err: any) {
      console.error('❌ Erro ao carregar consultores:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Adiciona um novo consultor com recuperação automática de CV
   */
  const addConsultant = async (newConsultant: Omit<Consultant, 'id'>) => {
    try {
      console.log('➕ Criando consultor:', newConsultant);
      
      // 🔍 RECUPERAÇÃO AUTOMÁTICA DE CV E ANALISTA R&S
      let cvData: { pessoa_id?: number; candidatura_id?: number; curriculo_url?: string; analista_rs_id?: number } = {};
      
      if (newConsultant.cpf || newConsultant.email_consultor) {
        console.log('🔍 Buscando CV do candidato...');
        
        let pessoaQuery = supabase.from('pessoas').select('*');
        
        if (newConsultant.cpf) {
          pessoaQuery = pessoaQuery.eq('cpf', newConsultant.cpf);
        } else if (newConsultant.email_consultor) {
          pessoaQuery = pessoaQuery.eq('email', newConsultant.email_consultor);
        }
        
        const { data: pessoaData, error: pessoaError } = await pessoaQuery.single();
        
        if (!pessoaError && pessoaData) {
          console.log('✅ Pessoa encontrada no banco de talentos:', pessoaData.nome);
          cvData.pessoa_id = pessoaData.id;
          cvData.curriculo_url = pessoaData.curriculo_url;
          
          // Buscar candidatura aprovada desta pessoa
          const { data: candidaturaData } = await supabase
            .from('candidaturas')
            .select('*')
            .eq('pessoa_id', String(pessoaData.id))
            .in('status', ['aprovado_cliente', 'aprovado'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (candidaturaData) {
            console.log('✅ Candidatura aprovada encontrada');
            cvData.candidatura_id = parseInt(candidaturaData.id);
            
            if (candidaturaData.analista_id) {
              cvData.analista_rs_id = candidaturaData.analista_id;
              console.log('✅ Analista R&S encontrado automaticamente:', candidaturaData.analista_id);
            }
          }
          
          if (cvData.curriculo_url) {
            console.log('📎 CV recuperado automaticamente:', cvData.curriculo_url);
          }
        }
      }

      const { data, error } = await supabase
        .from('consultants')
        .insert([{
          nome_consultores: newConsultant.nome_consultores,
          email_consultor: newConsultant.email_consultor,
          cpf: newConsultant.cpf,
          cargo_consultores: newConsultant.cargo_consultores,
          data_inclusao_consultores: newConsultant.data_inclusao_consultores,
          status: newConsultant.status || 'Ativo',
          valor_faturamento: newConsultant.valor_faturamento,
          valor_pagamento: newConsultant.valor_pagamento,
          gestor_imediato_id: newConsultant.gestor_imediato_id,
          coordenador_id: newConsultant.coordenador_id,
          analista_rs_id: cvData.analista_rs_id || newConsultant.analista_rs_id || null,
          id_gestao_de_pessoas: newConsultant.id_gestao_de_pessoas,
          pessoa_id: cvData.pessoa_id || null,
          candidatura_id: cvData.candidatura_id || null,
          curriculo_url: cvData.curriculo_url || null,
          curriculo_uploaded_at: cvData.curriculo_url ? new Date().toISOString() : null
        }])
        .select()
        .single();

      if (error) throw error;

      const createdConsultant: Consultant = {
        ...data,
        reports: []
      };

      setConsultants(prev => [...prev, createdConsultant]);
      console.log('✅ Consultor criado:', createdConsultant);
      
      return createdConsultant;
    } catch (err: any) {
      console.error('❌ Erro ao criar consultor:', err);
      alert(`Erro ao criar consultor: ${err.message}`);
      throw err;
    }
  };

  /**
   * Atualiza um consultor existente
   */
  const updateConsultant = async (id: number, updates: Partial<Consultant>) => {
    try {
      console.log('📝 Atualizando consultor:', id, updates);

      const { data, error } = await supabase
        .from('consultants')
        .update({
          nome_consultores: updates.nome_consultores,
          email_consultor: updates.email_consultor,
          cpf: updates.cpf,
          cargo_consultores: updates.cargo_consultores,
          status: updates.status,
          data_saida: updates.data_saida,
          motivo_desligamento: updates.motivo_desligamento,
          valor_faturamento: updates.valor_faturamento,
          valor_pagamento: updates.valor_pagamento,
          gestor_imediato_id: updates.gestor_imediato_id,
          coordenador_id: updates.coordenador_id,
          analista_rs_id: updates.analista_rs_id,
          id_gestao_de_pessoas: updates.id_gestao_de_pessoas
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedConsultant: Consultant = {
        ...data,
        reports: []
      };

      setConsultants(prev => prev.map(c => c.id === id ? updatedConsultant : c));
      console.log('✅ Consultor atualizado:', updatedConsultant);
      
      return updatedConsultant;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar consultor:', err);
      alert(`Erro ao atualizar consultor: ${err.message}`);
      throw err;
    }
  };

  /**
   * Adiciona múltiplos consultores em lote com recuperação de CVs
   */
  const batchAddConsultants = async (newConsultants: Omit<Consultant, 'id'>[]) => {
    try {
      console.log(`➕ Criando ${newConsultants.length} consultores em lote...`);
      
      // 🔍 RECUPERAÇÃO AUTOMÁTICA DE CVs EM LOTE
      console.log('🔍 Buscando CVs dos candidatos em lote...');
      
      const cpfs = newConsultants.filter(c => c.cpf).map(c => c.cpf);
      const emails = newConsultants.filter(c => c.email_consultor).map(c => c.email_consultor);
      
      const { data: pessoasData } = await supabase
        .from('pessoas')
        .select('*')
        .or(`cpf.in.(${cpfs.join(',')}),email.in.(${emails.join(',')})`);
      
      // Criar mapa de CVs por CPF e Email
      const cvMap = new Map<string, any>();
      if (pessoasData) {
        for (const pessoa of pessoasData) {
          if (pessoa.cpf) cvMap.set(`cpf:${pessoa.cpf}`, pessoa);
          if (pessoa.email) cvMap.set(`email:${pessoa.email}`, pessoa);
        }
        console.log(`✅ ${pessoasData.length} pessoas encontradas no banco de talentos`);
      }

      const { data, error } = await supabase
        .from('consultants')
        .insert(newConsultants.map(c => {
          let pessoa = null;
          if (c.cpf) pessoa = cvMap.get(`cpf:${c.cpf}`);
          if (!pessoa && c.email_consultor) pessoa = cvMap.get(`email:${c.email_consultor}`);
          
          return {
            nome_consultores: c.nome_consultores,
            email_consultor: c.email_consultor,
            cpf: c.cpf,
            cargo_consultores: c.cargo_consultores,
            data_inclusao_consultores: c.data_inclusao_consultores,
            status: c.status || 'Ativo',
            valor_faturamento: c.valor_faturamento,
            gestor_imediato_id: c.gestor_imediato_id,
            coordenador_id: c.coordenador_id,
            analista_rs_id: c.analista_rs_id,
            id_gestao_de_pessoas: c.id_gestao_de_pessoas,
            pessoa_id: pessoa?.id || null,
            curriculo_url: pessoa?.curriculo_url || null,
            curriculo_uploaded_at: pessoa?.curriculo_url ? new Date().toISOString() : null
          };
        }))
        .select();

      if (error) throw error;

      const createdConsultants: Consultant[] = (data || []).map((consultant: any) => ({
        ...consultant,
        reports: []
      }));

      setConsultants(prev => [...prev, ...createdConsultants]);
      console.log(`✅ ${createdConsultants.length} consultores criados em lote`);
      
      return createdConsultants;
    } catch (err: any) {
      console.error('❌ Erro ao criar consultores em lote:', err);
      alert(`Erro ao criar consultores: ${err.message}`);
      throw err;
    }
  };

  /**
   * Inativa um consultor (soft delete)
   */
  const inactivateConsultant = async (id: number, dataDesligamento: string, motivoDesligamento?: string) => {
    try {
      console.log(`⏸️ Inativando consultor ${id}...`);
      
      const { data, error } = await supabase
        .from('consultants')
        .update({
          status: 'Encerrado',
          data_saida: dataDesligamento,
          motivo_desligamento: motivoDesligamento || undefined
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedConsultant: Consultant = {
        ...data,
        reports: []
      };

      setConsultants(prev => prev.map(c => c.id === id ? updatedConsultant : c));
      console.log(`✅ Consultor ${id} inativado com sucesso!`);
      
      return updatedConsultant;
    } catch (err: any) {
      console.error('❌ Erro ao inativar consultor:', err);
      throw err;
    }
  };

  /**
   * 🔥 LAZY LOADING DE RELATÓRIOS
   * Carrega relatórios de um consultor específico sob demanda
   * Inclui retry automático e tratamento robusto de erros
   */
  const loadConsultantReports = async (consultantId: number): Promise<ConsultantReport[]> => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`📊 Carregando relatórios do consultor ${consultantId}... (tentativa ${attempt}/${MAX_RETRIES})`);
        
        if (!supabase) {
          throw new Error('Cliente Supabase não inicializado');
        }
        
        const { data, error } = await supabase
          .from('consultant_reports')
          .select('*')
          .eq('consultant_id', consultantId)
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error(`❌ Erro Supabase (tentativa ${attempt}):`, error);
          throw error;
        }
        
        const reports: ConsultantReport[] = (data || []).map((report: any) => {
          let parsedRecommendations = [];
          try {
            if (typeof report.recommendations === 'string') {
              parsedRecommendations = JSON.parse(report.recommendations);
            } else if (Array.isArray(report.recommendations)) {
              parsedRecommendations = report.recommendations;
            }
          } catch (parseError) {
            console.warn(`⚠️ Erro ao parsear recommendations do relatório ${report.id}:`, parseError);
            parsedRecommendations = [];
          }
          
          return {
            id: report.id,
            month: report.month,
            year: report.year,
            riskScore: report.risk_score,
            summary: report.summary || '',
            negativePattern: report.negative_pattern || null,
            predictiveAlert: report.predictive_alert || null,
            recommendations: parsedRecommendations,
            content: report.content || '',
            createdAt: report.created_at || new Date().toISOString(),
            generatedBy: report.generated_by || 'unknown',
            aiJustification: report.ai_justification || ''
          };
        });
        
        console.log(`✅ ${reports.length} relatórios carregados para consultor ${consultantId}`);
        
        // Atualizar o estado local do consultor com os relatórios
        setConsultants(prev => prev.map(c => 
          c.id === consultantId 
            ? { ...c, consultant_reports: reports }
            : c
        ));
        
        return reports;
        
      } catch (err: any) {
        const isNetworkError = err.message?.includes('fetch') || 
                               err.message?.includes('network') ||
                               err.code === 'NETWORK_ERROR';
        
        console.error(`❌ Erro ao carregar relatórios (tentativa ${attempt}/${MAX_RETRIES}):`, {
          message: err.message,
          code: err.code,
          hint: err.hint,
          details: err.details
        });
        
        if (attempt < MAX_RETRIES && isNetworkError) {
          console.log(`⏳ Aguardando ${RETRY_DELAY * attempt}ms antes de tentar novamente...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
          continue;
        }
        
        console.error(`❌ Falha definitiva ao carregar relatórios do consultor ${consultantId}:`, err);
        
        const friendlyError = new Error(
          `Erro ao carregar relatórios: ${err.message || 'Falha na conexão com o servidor'}`
        );
        (friendlyError as any).code = err.code;
        (friendlyError as any).hint = err.hint;
        (friendlyError as any).details = err.details;
        throw friendlyError;
      }
    }
    
    return [];
  };

  return {
    consultants,
    setConsultants,
    loading,
    error,
    loadConsultants,
    addConsultant,
    updateConsultant,
    batchAddConsultants,
    inactivateConsultant,
    loadConsultantReports
  };
};
