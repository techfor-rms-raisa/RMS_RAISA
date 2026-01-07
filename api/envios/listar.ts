/**
 * listar.ts - API para listar envios de CVs
 * 
 * Endpoint seguro no backend que consulta Supabase
 * 
 * Data: 06/01/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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
    // Parâmetros de filtro (query string ou body)
    const filtros = req.method === 'GET' ? req.query : req.body;
    const {
      status,
      cliente_id,
      vaga_id,
      analista_id,
      data_inicio,
      data_fim,
      limit = 50,
      offset = 0
    } = filtros;

    console.log('📤 [API] Listando envios...', filtros);

    // Query base
    let query = supabaseAdmin
      .from('candidatura_envios')
      .select(`
        *,
        candidaturas!candidatura_id (
          id,
          candidato_nome,
          candidato_email,
          status
        ),
        vagas!vaga_id (
          id,
          titulo
        ),
        clients!cliente_id (
          id,
          razao_social_cliente
        )
      `)
      .eq('ativo', true)
      .order('enviado_em', { ascending: false });

    // Aplicar filtros
    if (status) {
      query = query.eq('status', status);
    }
    if (cliente_id) {
      query = query.eq('cliente_id', parseInt(cliente_id as string));
    }
    if (vaga_id) {
      query = query.eq('vaga_id', parseInt(vaga_id as string));
    }
    if (analista_id) {
      query = query.eq('analista_id', parseInt(analista_id as string));
    }
    if (data_inicio) {
      query = query.gte('enviado_em', data_inicio);
    }
    if (data_fim) {
      query = query.lte('enviado_em', data_fim);
    }

    // Paginação
    query = query.range(
      parseInt(offset as string), 
      parseInt(offset as string) + parseInt(limit as string) - 1
    );

    const { data: envios, error, count } = await query;

    if (error) throw error;

    // Enriquecer dados
    const enviosEnriquecidos = (envios || []).map((e: any) => ({
      ...e,
      candidato_nome: e.candidaturas?.candidato_nome || 'N/A',
      candidato_email: e.candidaturas?.candidato_email || '',
      vaga_titulo: e.vagas?.titulo || 'N/A',
      cliente_nome: e.clients?.razao_social_cliente || 'N/A'
    }));

    // Buscar métricas
    const metricas = await calcularMetricas();

    console.log(`✅ [API] ${enviosEnriquecidos.length} envios encontrados`);

    return res.status(200).json({
      success: true,
      data: enviosEnriquecidos,
      metricas,
      pagination: {
        total: count,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });

  } catch (error: any) {
    console.error('❌ [API] Erro ao listar envios:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function calcularMetricas() {
  try {
    // Total de envios
    const { count: totalEnvios } = await supabaseAdmin
      .from('candidatura_envios')
      .select('id', { count: 'exact', head: true })
      .eq('ativo', true);

    // Visualizados
    const { count: totalVisualizados } = await supabaseAdmin
      .from('candidatura_envios')
      .select('id', { count: 'exact', head: true })
      .eq('ativo', true)
      .in('status', ['visualizado', 'em_analise']);

    // Aprovações
    const { data: aprovacoes } = await supabaseAdmin
      .from('candidatura_aprovacoes')
      .select('decisao, dias_para_resposta')
      .eq('ativo', true);

    const totalAprovados = aprovacoes?.filter(a => a.decisao === 'aprovado').length || 0;
    const totalReprovados = aprovacoes?.filter(a => a.decisao === 'reprovado').length || 0;
    const totalAguardando = aprovacoes?.filter(a => 
      ['em_analise', 'aguardando_resposta', 'agendado'].includes(a.decisao)
    ).length || 0;

    // Tempo médio de resposta
    const temposResposta = aprovacoes
      ?.filter(a => a.dias_para_resposta !== null)
      .map(a => a.dias_para_resposta || 0) || [];
    
    const tempoMedio = temposResposta.length > 0
      ? temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length
      : 0;

    const total = totalEnvios || 0;

    return {
      total_envios: total,
      total_visualizados: totalVisualizados || 0,
      total_aprovados: totalAprovados,
      total_reprovados: totalReprovados,
      total_aguardando: totalAguardando,
      taxa_aprovacao: total > 0 ? Math.round((totalAprovados / total) * 100) : 0,
      taxa_visualizacao: total > 0 ? Math.round(((totalVisualizados || 0) / total) * 100) : 0,
      tempo_medio_resposta_dias: Math.round(tempoMedio * 10) / 10
    };
  } catch (error) {
    console.error('Erro ao calcular métricas:', error);
    return {
      total_envios: 0,
      total_visualizados: 0,
      total_aprovados: 0,
      total_reprovados: 0,
      total_aguardando: 0,
      taxa_aprovacao: 0,
      taxa_visualizacao: 0,
      tempo_medio_resposta_dias: 0
    };
  }
}
