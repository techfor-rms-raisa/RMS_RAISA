/**
 * SERVIÇO: CANDIDATURA ENVIO
 * Gerencia envio de CVs para clientes e registro de aprovações
 * 
 * Versão: 1.1
 * Data: 28/12/2024
 */

import { supabase } from '../config/supabase';
import { CandidaturaEnvio, CandidaturaAprovacao } from '@/types';

export const candidatureEnvioService = {
  
  async registrarEnvio(data: Omit<CandidaturaEnvio, 'id' | 'enviado_em' | 'status' | 'ativo'>) {
    const { data: envio, error } = await supabase
      .from('candidatura_envio')
      .insert({
        ...data,
        enviado_em: new Date().toISOString(),
        status: 'enviado',
        ativo: true
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Atualizar status da candidatura
    await supabase
      .from('candidaturas')
      .update({ 
        status: 'enviado_cliente',
        atualizado_em: new Date().toISOString()
      })
      .eq('id', data.candidatura_id);
    
    return envio;
  },
  
  async buscarEnviosPorAnalista(analista_id: number) {
    const { data, error } = await supabase
      .from('candidatura_envio')
      .select('*')
      .eq('analista_id', analista_id)
      .eq('ativo', true)
      .order('enviado_em', { ascending: false });
    
    if (error) throw error;
    return data;
  },
  
  async registrarAprovacao(data: Omit<CandidaturaAprovacao, 'id' | 'registrado_em' | 'ativo' | 'dias_para_resposta' | 'respondido_no_prazo'>) {
    // Calcular dias para resposta
    const { data: envio } = await supabase
      .from('candidatura_envio')
      .select('enviado_em')
      .eq('id', data.candidatura_envio_id)
      .single();
    
    let dias_para_resposta = null;
    let respondido_no_prazo = null;
    
    if (envio && data.decidido_em) {
      const enviado = new Date(envio.enviado_em);
      const decidido = new Date(data.decidido_em);
      dias_para_resposta = Math.ceil((decidido.getTime() - enviado.getTime()) / (1000 * 60 * 60 * 24));
      respondido_no_prazo = dias_para_resposta <= (data.prazo_resposta_dias || 5);
    }
    
    const { data: aprovacao, error } = await supabase
      .from('candidatura_aprovacao')
      .upsert({
        ...data,
        dias_para_resposta,
        respondido_no_prazo,
        registrado_em: new Date().toISOString(),
        ativo: true
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Atualizar status da candidatura
    let novo_status = 'aguardando_cliente';
    if (data.decisao === 'aprovado') {
      novo_status = 'aprovado_cliente';
    } else if (data.decisao === 'reprovado') {
      novo_status = 'reprovado_cliente';
    }
    
    await supabase
      .from('candidaturas')
      .update({ 
        status: novo_status,
        atualizado_em: new Date().toISOString()
      })
      .eq('id', data.candidatura_id);
    
    return aprovacao;
  }
};
