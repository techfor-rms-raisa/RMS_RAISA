/**
 * usePessoas Hook - Gerenciamento de Pessoas/Talentos (RAISA)
 * 
 * 🆕 v56.0: Sistema de Exclusividade de Candidatos
 * - Atribuição automática de analista ao inserir/importar
 * - Cálculo de data final de exclusividade
 * - Filtros por exclusividade (meus candidatos / disponíveis)
 * - Renovação e liberação de exclusividade
 * 
 * Data: 11/01/2026
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../config/supabase';
import { Pessoa, ConfigExclusividade, LogExclusividade } from '@/types';

// ============================================
// 🆕 FUNÇÕES HELPER PARA ANONIMIZAÇÃO
// ============================================

/**
 * Gera nome anonimizado total: José da Silva Xavier → J.S.X.
 */
export const gerarNomeAnoniTotal = (nomeCompleto: string | null | undefined): string => {
  if (!nomeCompleto) return '';
  
  const preposicoes = ['da', 'de', 'do', 'dos', 'das', 'e'];
  const partes = nomeCompleto.trim().split(/\s+/);
  
  return partes
    .filter(parte => parte.length > 2 && !preposicoes.includes(parte.toLowerCase()))
    .map(parte => parte.charAt(0).toUpperCase() + '.')
    .join('');
};

/**
 * Gera nome anonimizado parcial: José da Silva Xavier → José S.X.
 */
export const gerarNomeAnoniParcial = (nomeCompleto: string | null | undefined): string => {
  if (!nomeCompleto) return '';
  
  const preposicoes = ['da', 'de', 'do', 'dos', 'das', 'e'];
  const partes = nomeCompleto.trim().split(/\s+/);
  
  if (partes.length === 0) return '';
  
  const primeiroNome = partes[0];
  const iniciais = partes
    .slice(1)
    .filter(parte => parte.length > 2 && !preposicoes.includes(parte.toLowerCase()))
    .map(parte => parte.charAt(0).toUpperCase() + '.')
    .join('');
  
  if (!iniciais) {
    return primeiroNome + ' ' + primeiroNome.charAt(0).toUpperCase() + '.';
  }
  
  return primeiroNome + ' ' + iniciais;
};

// ============================================
// 🆕 TIPOS PARA FILTROS DE EXCLUSIVIDADE
// ============================================

export interface FiltrosExclusividade {
  modoVisualizacao: 'meus' | 'disponiveis' | 'todos';
  analistaId?: number;
  incluirExpirados?: boolean;
}

// ============================================
// HOOK PRINCIPAL
// ============================================

export const usePessoas = () => {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega pessoas do banco de talentos com filtro de exclusividade
   */
  const loadPessoas = async (
    filtros?: FiltrosExclusividade,
    analistaLogadoId?: number,
    papelUsuario?: string
  ) => {
    try {
      setLoading(true);
      
      // 🔧 v57.2: JOIN com FK correta (fk_pessoas_analista_rs)
      let query = supabase
        .from('pessoas')
        .select(`
          *,
          analista:app_users!fk_pessoas_analista_rs(id, nome_usuario, email_usuario)
        `)
        .eq('ativo', true)
        .order('created_at', { ascending: false });

      const modo = filtros?.modoVisualizacao || 'meus';
      const agora = new Date().toISOString();

      if (modo === 'meus' && analistaLogadoId) {
        query = query.eq('id_analista_rs', analistaLogadoId);
      } else if (modo === 'disponiveis') {
        query = query.or(\`id_analista_rs.is.null,data_final_exclusividade.lt.\${agora}\`);
      } else if (modo === 'todos') {
        const papeisPermitidos = ['Admin', 'Gestão de R&S'];
        if (!papelUsuario || !papeisPermitidos.includes(papelUsuario)) {
          if (analistaLogadoId) {
            query = query.or(\`id_analista_rs.eq.\${analistaLogadoId},id_analista_rs.is.null,data_final_exclusividade.lt.\${agora}\`);
          } else {
            query = query.or(\`id_analista_rs.is.null,data_final_exclusividade.lt.\${agora}\`);
          }
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      const mappedPessoas: Pessoa[] = (data || []).map((pessoa: any) => {
        let statusExclusividade: Pessoa['status_exclusividade'] = 'sem_exclusividade';
        let diasRestantes: number | undefined = undefined;
        
        if (pessoa.data_final_exclusividade) {
          const dataFinal = new Date(pessoa.data_final_exclusividade);
          const agora = new Date();
          const diffMs = dataFinal.getTime() - agora.getTime();
          const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          
          diasRestantes = Math.max(0, diffDias);
          
          if (diffDias < 0) {
            statusExclusividade = 'expirada';
          } else if (diffDias <= 5) {
            statusExclusividade = 'expirando_urgente';
          } else if (diffDias <= 15) {
            statusExclusividade = 'expirando_breve';
          } else {
            statusExclusividade = 'ativa';
          }
        }

        return {
          id: String(pessoa.id),
          nome: pessoa.nome,
          email: pessoa.email,
          telefone: pessoa.telefone,
          cpf: pessoa.cpf,
          linkedin_url: pessoa.linkedin_url,
          curriculo_url: pessoa.curriculo_url,
          observacoes: pessoa.observacoes,
          created_at: pessoa.created_at,
          nome_anoni_total: pessoa.nome_anoni_total,
          nome_anoni_parcial: pessoa.nome_anoni_parcial,
          titulo_profissional: pessoa.titulo_profissional,
          senioridade: pessoa.senioridade,
          disponibilidade: pessoa.disponibilidade,
          modalidade_preferida: pessoa.modalidade_preferida,
          pretensao_salarial: pessoa.pretensao_salarial,
          cidade: pessoa.cidade,
          estado: pessoa.estado,
          cv_processado: pessoa.cv_processado,
          cv_processado_em: pessoa.cv_processado_em,
          resumo_profissional: pessoa.resumo_profissional,
          cv_texto_original: pessoa.cv_texto_original,
          cv_arquivo_url: pessoa.cv_arquivo_url,
          origem: pessoa.origem,
          id_analista_rs: pessoa.id_analista_rs,
          periodo_exclusividade: pessoa.periodo_exclusividade,
          data_inicio_exclusividade: pessoa.data_inicio_exclusividade,
          data_final_exclusividade: pessoa.data_final_exclusividade,
          qtd_renovacoes: pessoa.qtd_renovacoes,
          max_renovacoes: pessoa.max_renovacoes,
          // 🔧 v57.2: Nome do analista via JOIN com FK
          analista_nome: pessoa.analista?.nome_usuario,
          status_exclusividade: statusExclusividade,
          dias_restantes: diasRestantes,
          pode_renovar: (pessoa.qtd_renovacoes || 0) < (pessoa.max_renovacoes || 2)
        };
      });

      setPessoas(mappedPessoas);
      console.log(\`✅ \${mappedPessoas.length} pessoas carregadas (modo: \${modo})\`);
      return mappedPessoas;
    } catch (err: any) {
      console.error('❌ Erro ao carregar pessoas:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Adiciona uma nova pessoa ao banco de talentos com exclusividade
   */
  const addPessoa = async (
    newPessoa: Omit<Pessoa, 'id'>,
    analistaId?: number,
    configExclusividade?: ConfigExclusividade
  ) => {
    try {
      console.log('➕ Criando pessoa:', newPessoa.nome, 'Analista:', analistaId);

      const nomeAnoniTotal = gerarNomeAnoniTotal(newPessoa.nome);
      const nomeAnoniParcial = gerarNomeAnoniParcial(newPessoa.nome);

      let periodoExclusividade = configExclusividade?.periodo_exclusividade_default || 60;
      let maxRenovacoes = configExclusividade?.max_renovacoes || 2;
      
      if (!configExclusividade) {
        const { data: config } = await supabase
          .from('config_exclusividade')
          .select('*')
          .eq('ativa', true)
          .single();
        
        if (config) {
          periodoExclusividade = config.periodo_exclusividade_default;
          maxRenovacoes = config.max_renovacoes;
        }
      }

      const dataInicio = new Date();
      const dataFinal = analistaId 
        ? new Date(dataInicio.getTime() + periodoExclusividade * 24 * 60 * 60 * 1000)
        : null;

      const { data, error } = await supabase
        .from('pessoas')
        .insert([{
          nome: newPessoa.nome,
          email: newPessoa.email,
          telefone: newPessoa.telefone,
          cpf: newPessoa.cpf,
          linkedin_url: newPessoa.linkedin_url,
          curriculo_url: newPessoa.curriculo_url,
          observacoes: newPessoa.observacoes,
          nome_anoni_total: nomeAnoniTotal,
          nome_anoni_parcial: nomeAnoniParcial,
          titulo_profissional: newPessoa.titulo_profissional,
          senioridade: newPessoa.senioridade,
          disponibilidade: newPessoa.disponibilidade,
          modalidade_preferida: newPessoa.modalidade_preferida,
          pretensao_salarial: newPessoa.pretensao_salarial,
          cidade: newPessoa.cidade,
          estado: newPessoa.estado,
          cv_processado: newPessoa.cv_processado,
          cv_processado_em: newPessoa.cv_processado_em,
          resumo_profissional: newPessoa.resumo_profissional,
          cv_texto_original: newPessoa.cv_texto_original,
          cv_arquivo_url: newPessoa.cv_arquivo_url,
          origem: newPessoa.origem || 'manual',
          id_analista_rs: analistaId || null,
          periodo_exclusividade: periodoExclusividade,
          data_inicio_exclusividade: analistaId ? dataInicio.toISOString() : null,
          data_final_exclusividade: dataFinal?.toISOString() || null,
          qtd_renovacoes: 0,
          max_renovacoes: maxRenovacoes
        }])
        .select()
        .single();

      if (error) throw error;

      if (analistaId) {
        await supabase.from('log_exclusividade').insert({
          pessoa_id: data.id,
          acao: 'atribuicao',
          analista_novo_id: analistaId,
          realizado_por: analistaId,
          motivo: \`Cadastro inicial via \${newPessoa.origem || 'manual'}\`,
          data_exclusividade_nova: dataFinal?.toISOString(),
          qtd_renovacoes_nova: 0
        });
      }

      const createdPessoa: Pessoa = {
        id: String(data.id),
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        cpf: data.cpf,
        linkedin_url: data.linkedin_url,
        curriculo_url: data.curriculo_url,
        observacoes: data.observacoes,
        created_at: data.created_at,
        nome_anoni_total: data.nome_anoni_total,
        nome_anoni_parcial: data.nome_anoni_parcial,
        id_analista_rs: data.id_analista_rs,
        periodo_exclusividade: data.periodo_exclusividade,
        data_inicio_exclusividade: data.data_inicio_exclusividade,
        data_final_exclusividade: data.data_final_exclusividade,
        qtd_renovacoes: data.qtd_renovacoes,
        max_renovacoes: data.max_renovacoes,
        status_exclusividade: analistaId ? 'ativa' : 'sem_exclusividade',
        dias_restantes: analistaId ? periodoExclusividade : undefined,
        pode_renovar: true
      };

      setPessoas(prev => [createdPessoa, ...prev]);
      console.log('✅ Pessoa criada com exclusividade:', createdPessoa.nome);
      
      return createdPessoa;
    } catch (err: any) {
      console.error('❌ Erro ao criar pessoa:', err);
      alert(\`Erro ao criar pessoa: \${err.message}\`);
      throw err;
    }
  };

  /**
   * Atualiza uma pessoa existente (renova exclusividade se analista editar)
   */
  const updatePessoa = async (
    id: string, 
    updates: Partial<Pessoa>,
    analistaId?: number,
    renovarExclusividadeFlag: boolean = true
  ) => {
    try {
      console.log('📝 Atualizando pessoa:', id, updates);

      let periodoExclusividade = 60;
      const { data: config } = await supabase
        .from('config_exclusividade')
        .select('*')
        .eq('ativa', true)
        .single();
      
      if (config) {
        periodoExclusividade = config.periodo_exclusividade_default;
      }

      const updateData: any = {
        nome: updates.nome,
        email: updates.email,
        telefone: updates.telefone,
        cpf: updates.cpf,
        linkedin_url: updates.linkedin_url,
        curriculo_url: updates.curriculo_url,
        observacoes: updates.observacoes,
        titulo_profissional: updates.titulo_profissional,
        senioridade: updates.senioridade,
        disponibilidade: updates.disponibilidade,
        modalidade_preferida: updates.modalidade_preferida,
        pretensao_salarial: updates.pretensao_salarial,
        cidade: updates.cidade,
        estado: updates.estado,
        atualizado_em: new Date().toISOString()
      };

      if (updates.nome) {
        updateData.nome_anoni_total = gerarNomeAnoniTotal(updates.nome);
        updateData.nome_anoni_parcial = gerarNomeAnoniParcial(updates.nome);
      }

      if (analistaId && renovarExclusividadeFlag) {
        const dataInicio = new Date();
        const dataFinal = new Date(dataInicio.getTime() + periodoExclusividade * 24 * 60 * 60 * 1000);
        
        updateData.id_analista_rs = analistaId;
        updateData.data_inicio_exclusividade = dataInicio.toISOString();
        updateData.data_final_exclusividade = dataFinal.toISOString();
        updateData.periodo_exclusividade = periodoExclusividade;
      }

      const { data, error } = await supabase
        .from('pessoas')
        .update(updateData)
        .eq('id', parseInt(id))
        .select()
        .single();

      if (error) throw error;

      if (analistaId && renovarExclusividadeFlag) {
        await supabase.from('log_exclusividade').insert({
          pessoa_id: parseInt(id),
          acao: 'atribuicao',
          analista_novo_id: analistaId,
          realizado_por: analistaId,
          motivo: 'Atualização de dados do candidato',
          data_exclusividade_nova: updateData.data_final_exclusividade,
          qtd_renovacoes_nova: data.qtd_renovacoes
        });
      }

      const updatedPessoa: Pessoa = {
        id: String(data.id),
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        cpf: data.cpf,
        linkedin_url: data.linkedin_url,
        curriculo_url: data.curriculo_url,
        observacoes: data.observacoes,
        created_at: data.created_at,
        nome_anoni_total: data.nome_anoni_total,
        nome_anoni_parcial: data.nome_anoni_parcial,
        id_analista_rs: data.id_analista_rs,
        periodo_exclusividade: data.periodo_exclusividade,
        data_inicio_exclusividade: data.data_inicio_exclusividade,
        data_final_exclusividade: data.data_final_exclusividade,
        qtd_renovacoes: data.qtd_renovacoes,
        max_renovacoes: data.max_renovacoes
      };

      setPessoas(prev => prev.map(p => p.id === id ? updatedPessoa : p));
      console.log('✅ Pessoa atualizada:', updatedPessoa.nome);
      
      return updatedPessoa;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar pessoa:', err);
      alert(\`Erro ao atualizar pessoa: \${err.message}\`);
      throw err;
    }
  };

  /**
   * Renova a exclusividade de um candidato
   */
  const renovarExclusividade = async (
    pessoaId: string,
    analistaId: number,
    motivo?: string
  ): Promise<{ sucesso: boolean; mensagem: string; novaData?: string }> => {
    try {
      const { data, error } = await supabase.rpc('renovar_exclusividade', {
        p_pessoa_id: parseInt(pessoaId),
        p_analista_id: analistaId,
        p_motivo: motivo || 'Renovação solicitada pelo analista'
      });

      if (error) throw error;

      if (data.sucesso) {
        setPessoas(prev => prev.map(p => {
          if (p.id === pessoaId) {
            return {
              ...p,
              data_final_exclusividade: data.nova_data,
              qtd_renovacoes: (p.qtd_renovacoes || 0) + 1,
              status_exclusividade: 'ativa',
              dias_restantes: 30,
              pode_renovar: data.renovacoes_restantes > 0
            };
          }
          return p;
        }));
      }

      return {
        sucesso: data.sucesso,
        mensagem: data.sucesso 
          ? \`Exclusividade renovada! Nova data: \${new Date(data.nova_data).toLocaleDateString('pt-BR')}\` 
          : data.erro,
        novaData: data.nova_data
      };
    } catch (err: any) {
      console.error('❌ Erro ao renovar exclusividade:', err);
      return { sucesso: false, mensagem: err.message };
    }
  };

  /**
   * Libera a exclusividade de um candidato (apenas Supervisor/Admin)
   */
  const liberarExclusividade = async (
    pessoaId: string,
    supervisorId: number,
    motivo: string
  ): Promise<{ sucesso: boolean; mensagem: string }> => {
    try {
      const { data, error } = await supabase.rpc('liberar_exclusividade', {
        p_pessoa_id: parseInt(pessoaId),
        p_supervisor_id: supervisorId,
        p_motivo: motivo
      });

      if (error) throw error;

      if (data.sucesso) {
        setPessoas(prev => prev.map(p => {
          if (p.id === pessoaId) {
            return {
              ...p,
              id_analista_rs: null,
              data_inicio_exclusividade: undefined,
              data_final_exclusividade: undefined,
              qtd_renovacoes: 0,
              status_exclusividade: 'sem_exclusividade',
              dias_restantes: undefined,
              analista_nome: undefined
            };
          }
          return p;
        }));
      }

      return {
        sucesso: data.sucesso,
        mensagem: data.sucesso ? data.mensagem : data.erro
      };
    } catch (err: any) {
      console.error('❌ Erro ao liberar exclusividade:', err);
      return { sucesso: false, mensagem: err.message };
    }
  };

  /**
   * Transfere a exclusividade para outro analista
   */
  const transferirExclusividade = async (
    pessoaId: string,
    novoAnalistaId: number,
    supervisorId: number,
    motivo: string
  ): Promise<{ sucesso: boolean; mensagem: string }> => {
    try {
      const { data, error } = await supabase.rpc('transferir_exclusividade', {
        p_pessoa_id: parseInt(pessoaId),
        p_novo_analista_id: novoAnalistaId,
        p_supervisor_id: supervisorId,
        p_motivo: motivo
      });

      if (error) throw error;

      if (data.sucesso) {
        await loadPessoas();
      }

      return {
        sucesso: data.sucesso,
        mensagem: data.sucesso ? data.mensagem : data.erro
      };
    } catch (err: any) {
      console.error('❌ Erro ao transferir exclusividade:', err);
      return { sucesso: false, mensagem: err.message };
    }
  };

  /**
   * Busca log de exclusividade
   */
  const buscarLogExclusividade = async (
    pessoaId?: number,
    analistaId?: number,
    limite: number = 50
  ): Promise<LogExclusividade[]> => {
    try {
      let query = supabase
        .from('log_exclusividade')
        .select(\`
          *,
          analista_anterior:app_users!analista_anterior_id(nome_usuario),
          analista_novo:app_users!analista_novo_id(nome_usuario),
          realizado:app_users!realizado_por(nome_usuario)
        \`)
        .order('criado_em', { ascending: false })
        .limit(limite);

      if (pessoaId) {
        query = query.eq('pessoa_id', pessoaId);
      }

      if (analistaId) {
        query = query.or(\`analista_anterior_id.eq.\${analistaId},analista_novo_id.eq.\${analistaId}\`);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((log: any) => ({
        ...log,
        analista_anterior_nome: log.analista_anterior?.nome_usuario,
        analista_novo_nome: log.analista_novo?.nome_usuario,
        realizado_por_nome: log.realizado?.nome_usuario
      }));
    } catch (err: any) {
      console.error('❌ Erro ao buscar log:', err);
      return [];
    }
  };

  /**
   * Busca pessoa por CPF ou Email
   */
  const findPessoaByCpfOrEmail = async (cpf?: string, email?: string): Promise<Pessoa | null> => {
    try {
      let query = supabase.from('pessoas').select('*');
      
      if (cpf) {
        query = query.eq('cpf', cpf);
      } else if (email) {
        query = query.eq('email', email);
      } else {
        return null;
      }
      
      const { data, error } = await query.single();
      
      if (error || !data) return null;
      
      return {
        id: String(data.id),
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        cpf: data.cpf,
        linkedin_url: data.linkedin_url,
        curriculo_url: data.curriculo_url,
        observacoes: data.observacoes,
        created_at: data.created_at,
        nome_anoni_total: data.nome_anoni_total,
        nome_anoni_parcial: data.nome_anoni_parcial,
        id_analista_rs: data.id_analista_rs,
        data_final_exclusividade: data.data_final_exclusividade
      };
    } catch (err) {
      console.error('❌ Erro ao buscar pessoa:', err);
      return null;
    }
  };

  /**
   * Busca pessoa por nome
   */
  const findPessoaByNome = async (nomeBusca: string): Promise<Pessoa[]> => {
    try {
      if (!nomeBusca || nomeBusca.length < 2) return [];
      
      const termoBusca = nomeBusca.trim();
      
      const { data, error } = await supabase
        .from('pessoas')
        .select('*')
        .or(\`nome.ilike.%\${termoBusca}%,nome_anoni_parcial.ilike.%\${termoBusca}%,nome_anoni_total.ilike.%\${termoBusca}%\`)
        .limit(10);
      
      if (error) {
        console.error('❌ Erro na busca por nome:', error);
        return [];
      }
      
      return (data || []).map((pessoa: any) => ({
        id: String(pessoa.id),
        nome: pessoa.nome,
        email: pessoa.email,
        telefone: pessoa.telefone,
        cpf: pessoa.cpf,
        linkedin_url: pessoa.linkedin_url,
        curriculo_url: pessoa.curriculo_url,
        observacoes: pessoa.observacoes,
        created_at: pessoa.created_at,
        nome_anoni_total: pessoa.nome_anoni_total,
        nome_anoni_parcial: pessoa.nome_anoni_parcial,
        titulo_profissional: pessoa.titulo_profissional,
        senioridade: pessoa.senioridade,
        id_analista_rs: pessoa.id_analista_rs,
        data_final_exclusividade: pessoa.data_final_exclusividade
      }));
    } catch (err) {
      console.error('❌ Erro ao buscar pessoa por nome:', err);
      return [];
    }
  };

  /**
   * Exclui uma pessoa
   */
  const deletePessoa = async (id: string) => {
    try {
      console.log('🗑️ Excluindo pessoa:', id);
      const pessoaId = parseInt(id);

      await supabase.from('pessoa_skills').delete().eq('pessoa_id', pessoaId);
      await supabase.from('pessoa_experiencias').delete().eq('pessoa_id', pessoaId);
      await supabase.from('pessoa_formacao').delete().eq('pessoa_id', pessoaId);
      await supabase.from('pessoa_idiomas').delete().eq('pessoa_id', pessoaId);
      await supabase.from('log_exclusividade').delete().eq('pessoa_id', pessoaId);

      const { error: errorPessoa } = await supabase
        .from('pessoas')
        .delete()
        .eq('id', pessoaId);

      if (errorPessoa) throw errorPessoa;

      setPessoas(prev => prev.filter(p => p.id !== id));
      console.log('✅ Pessoa excluída com sucesso');
      
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao excluir pessoa:', err);
      alert(\`Erro ao excluir pessoa: \${err.message}\`);
      throw err;
    }
  };

  return {
    pessoas,
    setPessoas,
    loading,
    error,
    loadPessoas,
    addPessoa,
    updatePessoa,
    deletePessoa,
    findPessoaByCpfOrEmail,
    findPessoaByNome,
    renovarExclusividade,
    liberarExclusividade,
    transferirExclusividade,
    buscarLogExclusividade
  };
};
