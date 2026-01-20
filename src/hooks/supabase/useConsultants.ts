/**
 * useConsultants Hook - Gerenciamento de Consultores
 * Módulo separado do useSupabaseData para melhor organização
 * Inclui lazy loading de relatórios
 * 
 * ✅ ATUALIZADO v2.3: Suporte completo a todos os campos da tabela consultants
 * - Adicionado: modalidade_contrato, substituicao, nome_substituido, observacoes, faturavel
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
        ativo_consultor: consultant.ativo_consultor,
        valor_faturamento: consultant.valor_faturamento,
        valor_pagamento: consultant.valor_pagamento,
        gestor_imediato_id: consultant.gestor_imediato_id,
        coordenador_id: consultant.coordenador_id,
        analista_rs_id: consultant.analista_rs_id,
        id_gestao_de_pessoas: consultant.id_gestao_de_pessoas,
        cliente_id: consultant.cliente_id,
        // Campos adicionais
        especialidade: consultant.especialidade,
        dt_aniversario: consultant.dt_aniversario,
        cnpj_consultor: consultant.cnpj_consultor,
        empresa_consultor: consultant.empresa_consultor,
        // ✅ v2.4: NOVOS CAMPOS
        modalidade_contrato: consultant.modalidade_contrato,
        substituicao: consultant.substituicao,
        nome_substituido: consultant.nome_substituido,
        faturavel: consultant.faturavel,
        observacoes: consultant.observacoes,
        // Pareceres
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
   * ✅ ATUALIZADO v2.3: Suporte a todos os campos da tabela
   */
  const addConsultant = async (newConsultant: Omit<Consultant, 'id'>) => {
    try {
      console.log('➕ Criando consultor:', newConsultant);
      
      // 🔍 RECUPERAÇÃO AUTOMÁTICA DE CV E ANALISTA R&S
      let cvData: { pessoa_id?: number; candidatura_id?: number; curriculo_url?: string; analista_rs_id?: number } = {};
      
      if (newConsultant.cpf || newConsultant.email_consultor) {
        console.log('🔍 Buscando CV e analista do candidato...');
        
        // Buscar pessoa pelo CPF ou Email
        let query = supabase.from('pessoas').select('*');
        
        if (newConsultant.cpf) {
          query = query.eq('cpf', newConsultant.cpf);
        } else if (newConsultant.email_consultor) {
          query = query.eq('email', newConsultant.email_consultor);
        }
        
        const { data: pessoaData } = await query.maybeSingle();
        
        if (pessoaData) {
          console.log('✅ Pessoa encontrada:', pessoaData.id);
          cvData.pessoa_id = pessoaData.id;
          cvData.curriculo_url = pessoaData.curriculo_url;
          
          // Buscar candidatura para pegar analista_rs_id
          const { data: candidaturaData } = await supabase
            .from('candidaturas')
            .select('id, analista_rs_id')
            .eq('pessoa_id', pessoaData.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (candidaturaData) {
            cvData.candidatura_id = candidaturaData.id;
            cvData.analista_rs_id = candidaturaData.analista_rs_id;
            console.log('✅ Candidatura encontrada:', candidaturaData.id, 'Analista:', candidaturaData.analista_rs_id);
          }
        }
      }

      const { data, error } = await supabase
        .from('consultants')
        .insert([{
          // Campos obrigatórios
          nome_consultores: newConsultant.nome_consultores,
          cargo_consultores: newConsultant.cargo_consultores,
          data_inclusao_consultores: newConsultant.data_inclusao_consultores,
          status: newConsultant.status || 'Ativo',
          ano_vigencia: newConsultant.ano_vigencia || new Date().getFullYear(),
          
          // Flag ativo
          ativo_consultor: (newConsultant as any).ativo_consultor ?? true,
          
          // Dados de contato
          email_consultor: newConsultant.email_consultor || null,
          celular: newConsultant.celular || null,
          cpf: newConsultant.cpf || null,
          
          // Dados PJ
          cnpj_consultor: (newConsultant as any).cnpj_consultor || null,
          empresa_consultor: (newConsultant as any).empresa_consultor || null,
          
          // Dados adicionais
          dt_aniversario: (newConsultant as any).dt_aniversario || null,
          especialidade: (newConsultant as any).especialidade || null,
          
          // Valores financeiros
          valor_faturamento: newConsultant.valor_faturamento || null,
          valor_pagamento: newConsultant.valor_pagamento || null,
          
          // Relacionamentos
          gestor_imediato_id: newConsultant.gestor_imediato_id,
          coordenador_id: newConsultant.coordenador_id || null,
          analista_rs_id: cvData.analista_rs_id || newConsultant.analista_rs_id || null,
          id_gestao_de_pessoas: newConsultant.id_gestao_de_pessoas || null,
          cliente_id: (newConsultant as any).cliente_id || null,
          
          // Vínculo com candidato (recuperação automática de CV)
          pessoa_id: cvData.pessoa_id || null,
          candidatura_id: cvData.candidatura_id || null,
          curriculo_url: cvData.curriculo_url || null,
          curriculo_uploaded_at: cvData.curriculo_url ? new Date().toISOString() : null,
          
          // ✅ v2.4: NOVOS CAMPOS - modalidade, substituição, observações
          modalidade_contrato: (newConsultant as any).modalidade_contrato || 'PJ',
          substituicao: (newConsultant as any).substituicao || false,
          nome_substituido: (newConsultant as any).nome_substituido || null,
          faturavel: (newConsultant as any).faturavel ?? true,
          observacoes: (newConsultant as any).observacoes || null,
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
   * ✅ CORRIGIDO: Aceita tanto (id, updates) quanto (consultant)
   * ✅ ATUALIZADO v2.3: Suporte a todos os campos da tabela
   */
  const updateConsultant = async (consultantOrId: number | Consultant, updates?: Partial<Consultant>) => {
    try {
      // ✅ Detectar formato de chamada
      let id: number;
      let updateData: Partial<Consultant>;
      
      if (typeof consultantOrId === 'number') {
        // Formato: updateConsultant(id, updates)
        id = consultantOrId;
        updateData = updates || {};
      } else {
        // Formato: updateConsultant(consultant)
        id = consultantOrId.id;
        updateData = consultantOrId;
      }
      
      console.log('📝 Atualizando consultor:', id, updateData);

      const { data, error } = await supabase
        .from('consultants')
        .update({
          // Campos básicos
          nome_consultores: updateData.nome_consultores,
          email_consultor: updateData.email_consultor,
          celular: updateData.celular,
          cpf: updateData.cpf,
          cargo_consultores: updateData.cargo_consultores,
          ano_vigencia: updateData.ano_vigencia,
          status: updateData.status,
          data_inclusao_consultores: (updateData as any).data_inclusao_consultores,
          data_saida: updateData.data_saida,
          motivo_desligamento: updateData.motivo_desligamento,
          
          // Flag ativo
          ativo_consultor: (updateData as any).ativo_consultor,
          
          // Valores financeiros
          valor_faturamento: updateData.valor_faturamento,
          valor_pagamento: updateData.valor_pagamento,
          
          // Relacionamentos
          gestor_imediato_id: updateData.gestor_imediato_id,
          coordenador_id: updateData.coordenador_id,
          analista_rs_id: updateData.analista_rs_id,
          id_gestao_de_pessoas: updateData.id_gestao_de_pessoas,
          cliente_id: (updateData as any).cliente_id,
          
          // Campos adicionais
          especialidade: (updateData as any).especialidade,
          dt_aniversario: (updateData as any).dt_aniversario,
          cnpj_consultor: (updateData as any).cnpj_consultor,
          empresa_consultor: (updateData as any).empresa_consultor,
          
          // ✅ v2.4: NOVOS CAMPOS - modalidade, substituição, observações
          modalidade_contrato: (updateData as any).modalidade_contrato,
          substituicao: (updateData as any).substituicao,
          nome_substituido: (updateData as any).nome_substituido,
          faturavel: (updateData as any).faturavel,
          observacoes: (updateData as any).observacoes,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedConsultant: Consultant = {
        ...data,
        reports: consultants.find(c => c.id === id)?.reports || []
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
   * Adiciona múltiplos consultores em lote
   * ✅ ATUALIZADO v2.3: Suporte a todos os campos da tabela
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
            // Campos obrigatórios
            nome_consultores: c.nome_consultores,
            cargo_consultores: c.cargo_consultores,
            data_inclusao_consultores: c.data_inclusao_consultores,
            status: c.status || 'Ativo',
            ano_vigencia: c.ano_vigencia || new Date().getFullYear(),
            
            // Flag ativo
            ativo_consultor: (c as any).ativo_consultor ?? true,
            
            // Dados de contato
            email_consultor: c.email_consultor || null,
            celular: c.celular || null,
            cpf: c.cpf || null,
            
            // Campos adicionais
            cnpj_consultor: (c as any).cnpj_consultor || null,
            empresa_consultor: (c as any).empresa_consultor || null,
            dt_aniversario: (c as any).dt_aniversario || null,
            especialidade: (c as any).especialidade || null,
            
            // Valores financeiros
            valor_faturamento: c.valor_faturamento || null,
            valor_pagamento: c.valor_pagamento || null,
            
            // Relacionamentos
            gestor_imediato_id: c.gestor_imediato_id,
            coordenador_id: c.coordenador_id || null,
            analista_rs_id: c.analista_rs_id || null,
            id_gestao_de_pessoas: c.id_gestao_de_pessoas || null,
            cliente_id: (c as any).cliente_id || null,
            
            // Vínculo com candidato
            pessoa_id: pessoa?.id || null,
            curriculo_url: pessoa?.curriculo_url || null,
            curriculo_uploaded_at: pessoa?.curriculo_url ? new Date().toISOString() : null,
            
            // ✅ v2.4: NOVOS CAMPOS
            modalidade_contrato: (c as any).modalidade_contrato || 'PJ',
            substituicao: (c as any).substituicao || false,
            nome_substituido: (c as any).nome_substituido || null,
            faturavel: (c as any).faturavel ?? true,
            observacoes: (c as any).observacoes || null,
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
          ativo_consultor: false,
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
      console.log('✅ Consultor inativado');
      
      return updatedConsultant;
    } catch (err: any) {
      console.error('❌ Erro ao inativar consultor:', err);
      throw err;
    }
  };

  /**
   * Carrega relatórios de um consultor específico (lazy loading)
   */
  const loadConsultantReports = async (consultantId: number): Promise<ConsultantReport[]> => {
    try {
      const { data, error } = await supabase
        .from('consultant_reports')
        .select('*')
        .eq('consultant_id', consultantId)
        .order('month', { ascending: true });

      if (error) throw error;

      // Atualizar o consultor no estado com os relatórios
      setConsultants(prev => prev.map(c => {
        if (c.id === consultantId) {
          return { ...c, reports: data || [], consultant_reports: data || [] };
        }
        return c;
      }));

      return data || [];
    } catch (err: any) {
      console.error(`❌ Erro ao carregar relatórios do consultor ${consultantId}:`, err);
      return [];
    }
  };

  /**
   * Atualiza um relatório mensal do consultor
   */
  const updateConsultantReport = async (reportId: number, updates: Partial<ConsultantReport>) => {
    try {
      const { data, error } = await supabase
        .from('consultant_reports')
        .update(updates)
        .eq('id', reportId)
        .select()
        .single();

      if (error) throw error;

      // Atualizar o estado local
      setConsultants(prev => prev.map(c => {
        const reportIndex = c.reports?.findIndex(r => r.id === reportId);
        if (reportIndex !== undefined && reportIndex >= 0 && c.reports) {
          const newReports = [...c.reports];
          newReports[reportIndex] = data;
          return { ...c, reports: newReports };
        }
        return c;
      }));

      return data;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar relatório:', err);
      throw err;
    }
  };

  return {
    consultants,
    loading,
    error,
    loadConsultants,
    addConsultant,
    updateConsultant,
    batchAddConsultants,
    inactivateConsultant,
    loadConsultantReports,
    updateConsultantReport,
    setConsultants
  };
};
