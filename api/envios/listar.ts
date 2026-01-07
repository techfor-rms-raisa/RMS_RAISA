/**
 * listar.ts - API para listar envios de CVs
 * 
 * Endpoint seguro no backend que consulta Supabase
 * 
 * Data: 07/01/2026 - CORRIGIDO (lazy initialization)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Função para criar cliente Supabase (lazy initialization)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(`Missing Supabase environment variables. URL: ${!!supabaseUrl}, Key: ${!!supabaseKey}`);
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    
    // Parâmetros de filtro
    const { status, cliente_id, vaga_id, data_inicio, data_fim } = req.query;

    // Query base - buscar envios
    let query = supabaseAdmin
      .from('candidatura_envios')
      .select('*')
      .eq('ativo', true)
      .order('enviado_em', { ascending: false });

    // Aplicar filtros
    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    if (cliente_id && typeof cliente_id === 'string') {
      query = query.eq('cliente_id', parseInt(cliente_id));
    }

    if (vaga_id && typeof vaga_id === 'string') {
      query = query.eq('vaga_id', parseInt(vaga_id));
    }

    if (data_inicio && typeof data_inicio === 'string') {
      query = query.gte('enviado_em', data_inicio);
    }

    if (data_fim && typeof data_fim === 'string') {
      query = query.lte('enviado_em', data_fim + 'T23:59:59');
    }

    const { data: envios, error } = await query;

    if (error) {
      console.error('Erro ao buscar envios:', error);
      return res.status(500).json({ error: error.message });
    }

    // Buscar dados relacionados para enriquecer
    const candidaturaIds = [...new Set((envios || []).map((e: any) => e.candidatura_id).filter(Boolean))];
    
    let candidaturasMap: any = {};
    let pessoasMap: any = {};
    let vagasMap: any = {};
    let clientesMap: any = {};

    if (candidaturaIds.length > 0) {
      // Buscar candidaturas
      const { data: candidaturas } = await supabaseAdmin
        .from('candidaturas')
        .select('id, pessoa_id, vaga_id')
        .in('id', candidaturaIds);

      candidaturasMap = (candidaturas || []).reduce((acc: any, c: any) => {
        acc[c.id] = c;
        return acc;
      }, {});

      // Buscar pessoas
      const pessoaIds = [...new Set((candidaturas || []).map((c: any) => c.pessoa_id).filter(Boolean))];
      if (pessoaIds.length > 0) {
        const { data: pessoas } = await supabaseAdmin
          .from('pessoas')
          .select('id, nome_completo, email')
          .in('id', pessoaIds);
        
        pessoasMap = (pessoas || []).reduce((acc: any, p: any) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }

      // Buscar vagas
      const vagaIds = [...new Set((candidaturas || []).map((c: any) => c.vaga_id).filter(Boolean))];
      if (vagaIds.length > 0) {
        const { data: vagas } = await supabaseAdmin
          .from('vagas')
          .select('id, titulo, cliente_id')
          .in('id', vagaIds);
        
        vagasMap = (vagas || []).reduce((acc: any, v: any) => {
          acc[v.id] = v;
          return acc;
        }, {});

        // Buscar clientes
        const clienteIds = [...new Set((vagas || []).map((v: any) => v.cliente_id).filter(Boolean))];
        if (clienteIds.length > 0) {
          const { data: clientes } = await supabaseAdmin
            .from('clients')
            .select('id, nome_cliente')
            .in('id', clienteIds);
          
          clientesMap = (clientes || []).reduce((acc: any, c: any) => {
            acc[c.id] = c;
            return acc;
          }, {});
        }
      }
    }

    // Enriquecer dados
    const enviosEnriquecidos = (envios || []).map((envio: any) => {
      const candidatura = candidaturasMap[envio.candidatura_id] || {};
      const pessoa = pessoasMap[candidatura.pessoa_id] || {};
      const vaga = vagasMap[candidatura.vaga_id] || vagasMap[envio.vaga_id] || {};
      const cliente = clientesMap[vaga.cliente_id] || clientesMap[envio.cliente_id] || {};

      return {
        id: envio.id,
        candidatura_id: envio.candidatura_id,
        vaga_id: envio.vaga_id,
        cliente_id: envio.cliente_id,
        candidato_nome: pessoa.nome_completo || 'N/A',
        candidato_email: pessoa.email || '',
        vaga_titulo: vaga.titulo || 'N/A',
        cliente_nome: cliente.nome_cliente || 'N/A',
        status: envio.status,
        meio_envio: envio.meio_envio || 'email',
        enviado_em: envio.enviado_em,
        enviado_por: envio.enviado_por,
        visualizado_em: envio.visualizado_em,
        origem: envio.origem || 'manual',
        email_message_id: envio.email_message_id
      };
    });

    // Calcular métricas
    const total_envios = enviosEnriquecidos.length;
    const total_visualizados = enviosEnriquecidos.filter((e: any) => 
      e.status === 'visualizado' || e.status === 'em_analise'
    ).length;

    // Buscar aprovações
    const { data: aprovacoes } = await supabaseAdmin
      .from('candidatura_aprovacoes')
      .select('*')
      .eq('ativo', true);

    const total_aprovados = (aprovacoes || []).filter((a: any) => a.decisao === 'aprovado').length;
    const total_reprovados = (aprovacoes || []).filter((a: any) => a.decisao === 'reprovado').length;
    const total_aguardando = (aprovacoes || []).filter((a: any) => 
      ['em_analise', 'aguardando_resposta', 'agendado'].includes(a.decisao)
    ).length;

    // Tempo médio de resposta
    const aprovacoesComTempo = (aprovacoes || []).filter((a: any) => a.dias_para_resposta !== null);
    const tempo_medio_resposta_dias = aprovacoesComTempo.length > 0
      ? Math.round(aprovacoesComTempo.reduce((acc: number, a: any) => acc + (a.dias_para_resposta || 0), 0) / aprovacoesComTempo.length)
      : 0;

    const metricas = {
      total_envios,
      total_visualizados,
      total_aprovados,
      total_reprovados,
      total_aguardando,
      taxa_aprovacao: total_envios > 0 ? Math.round((total_aprovados / total_envios) * 100) : 0,
      taxa_visualizacao: total_envios > 0 ? Math.round((total_visualizados / total_envios) * 100) : 0,
      tempo_medio_resposta_dias
    };

    return res.status(200).json({
      success: true,
      envios: enviosEnriquecidos,
      metricas
    });

  } catch (error: any) {
    console.error('Erro na API listar:', error);
    return res.status(500).json({ 
      error: error.message || 'Erro interno do servidor'
    });
  }
}
