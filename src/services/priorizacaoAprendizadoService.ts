/**
 * PRIORIZAÇÃO APRENDIZADO SERVICE
 * Gerencia análise mensal de aprendizado da IA
 */

import { supabase } from '../config/supabase';

export interface DecisaoHumana {
  vaga_id: number;
  vaga_titulo: string;
  score_ia: number;
  nivel_ia: string;
  sla_ia: number;
  score_humano?: number;
  nivel_humano?: string;
  sla_humano?: number;
  foi_alterado: boolean;
  data_decisao: string;
}

export interface VagaFechada {
  vaga_id: number;
  vaga_titulo: string;
  nivel_prioridade: string;
  sla_dias: number;
  dias_para_fechar: number;
  fechou_no_sla: boolean;
  candidato_aprovado: boolean;
  data_abertura: string;
  data_fechamento: string;
}

export interface RelatorioAprendizado {
  periodo: string;
  total_vagas_analisadas: number;
  total_decisoes_humanas: number;
  taxa_concordancia: number; // % de vezes que humano concordou com IA
  total_vagas_fechadas: number;
  taxa_sucesso_ia: number; // % de vagas que fecharam no SLA com candidato aprovado
  taxa_sucesso_humano: number; // % de vagas alteradas que tiveram sucesso
  decisoes_humanas: DecisaoHumana[];
  vagas_fechadas: VagaFechada[];
  insights: string[];
}

class PriorizacaoAprendizadoService {
  
  // ============================================
  // ANÁLISE MENSAL
  // ============================================
  
  async gerarRelatorioMensal(mes: number, ano: number): Promise<RelatorioAprendizado> {
    try {
      // Período
      const dataInicio = new Date(ano, mes - 1, 1);
      const dataFim = new Date(ano, mes, 0, 23, 59, 59);
      
      // Buscar decisões humanas (aprovações de priorização)
      const decisoesHumanas = await this.buscarDecisoesHumanas(dataInicio, dataFim);
      
      // Buscar vagas fechadas
      const vagasFechadas = await this.buscarVagasFechadas(dataInicio, dataFim);
      
      // Calcular métricas
      const totalVagasAnalisadas = decisoesHumanas.length;
      const totalDecisoesHumanas = decisoesHumanas.filter(d => d.foi_alterado).length;
      const taxaConcordancia = totalVagasAnalisadas > 0
        ? ((totalVagasAnalisadas - totalDecisoesHumanas) / totalVagasAnalisadas) * 100
        : 0;
      
      const totalVagasFechadas = vagasFechadas.length;
      
      // Vagas que seguiram recomendação da IA
      const vagasIA = vagasFechadas.filter(v => {
        const decisao = decisoesHumanas.find(d => d.vaga_id === v.vaga_id);
        return decisao && !decisao.foi_alterado;
      });
      
      const sucessoIA = vagasIA.filter(v => v.fechou_no_sla && v.candidato_aprovado).length;
      const taxaSucessoIA = vagasIA.length > 0 ? (sucessoIA / vagasIA.length) * 100 : 0;
      
      // Vagas que foram alteradas pelo humano
      const vagasHumano = vagasFechadas.filter(v => {
        const decisao = decisoesHumanas.find(d => d.vaga_id === v.vaga_id);
        return decisao && decisao.foi_alterado;
      });
      
      const sucessoHumano = vagasHumano.filter(v => v.fechou_no_sla && v.candidato_aprovado).length;
      const taxaSucessoHumano = vagasHumano.length > 0 ? (sucessoHumano / vagasHumano.length) * 100 : 0;
      
      // Gerar insights
      const insights = this.gerarInsights(
        taxaConcordancia,
        taxaSucessoIA,
        taxaSucessoHumano,
        decisoesHumanas,
        vagasFechadas
      );
      
      return {
        periodo: `${mes.toString().padStart(2, '0')}/${ano}`,
        total_vagas_analisadas: totalVagasAnalisadas,
        total_decisoes_humanas: totalDecisoesHumanas,
        taxa_concordancia: Math.round(taxaConcordancia * 100) / 100,
        total_vagas_fechadas: totalVagasFechadas,
        taxa_sucesso_ia: Math.round(taxaSucessoIA * 100) / 100,
        taxa_sucesso_humano: Math.round(taxaSucessoHumano * 100) / 100,
        decisoes_humanas: decisoesHumanas,
        vagas_fechadas: vagasFechadas,
        insights
      };
      
    } catch (error) {
      console.error('Erro ao gerar relatório mensal:', error);
      throw error;
    }
  }
  
  // ============================================
  // BUSCAR DADOS
  // ============================================
  
  private async buscarDecisoesHumanas(
    dataInicio: Date,
    dataFim: Date
  ): Promise<DecisaoHumana[]> {
    try {
      // Buscar vagas priorizadas no período
      const { data: vagas, error } = await supabase
        .from('vagas')
        .select(`
          id,
          titulo,
          prioridade_aprovada_em,
          vaga_priorizacao (
            score_prioridade,
            nivel_prioridade,
            sla_dias
          ),
          vaga_repriorizacao_sugestao (
            score_sugerido,
            nivel_sugerido,
            sla_sugerido,
            status
          )
        `)
        .gte('prioridade_aprovada_em', dataInicio.toISOString())
        .lte('prioridade_aprovada_em', dataFim.toISOString());
      
      if (error) throw error;
      
      const decisoes: DecisaoHumana[] = [];
      
      for (const vaga of vagas || []) {
        const priorizacao = Array.isArray(vaga.vaga_priorizacao) 
          ? vaga.vaga_priorizacao[0] 
          : vaga.vaga_priorizacao;
        
        const repriorizacao = Array.isArray(vaga.vaga_repriorizacao_sugestao)
          ? vaga.vaga_repriorizacao_sugestao.find((r: any) => r.status === 'aprovado')
          : null;
        
        if (priorizacao) {
          decisoes.push({
            vaga_id: vaga.id,
            vaga_titulo: vaga.titulo,
            score_ia: priorizacao.score_prioridade,
            nivel_ia: priorizacao.nivel_prioridade,
            sla_ia: priorizacao.sla_dias,
            score_humano: repriorizacao?.score_sugerido,
            nivel_humano: repriorizacao?.nivel_sugerido,
            sla_humano: repriorizacao?.sla_sugerido,
            foi_alterado: !!repriorizacao,
            data_decisao: vaga.prioridade_aprovada_em
          });
        }
      }
      
      return decisoes;
      
    } catch (error) {
      console.error('Erro ao buscar decisões humanas:', error);
      return [];
    }
  }
  
  private async buscarVagasFechadas(
    dataInicio: Date,
    dataFim: Date
  ): Promise<VagaFechada[]> {
    try {
      const { data: vagas, error } = await supabase
        .from('vagas')
        .select(`
          id,
          titulo,
          criado_em,
          fechado_em,
          vaga_priorizacao (
            nivel_prioridade,
            sla_dias
          ),
          candidaturas (
            status
          )
        `)
        .eq('status_workflow', 'fechada')
        .gte('fechado_em', dataInicio.toISOString())
        .lte('fechado_em', dataFim.toISOString());
      
      if (error) throw error;
      
      const vagasFechadas: VagaFechada[] = [];
      
      for (const vaga of vagas || []) {
        const priorizacao = Array.isArray(vaga.vaga_priorizacao)
          ? vaga.vaga_priorizacao[0]
          : vaga.vaga_priorizacao;
        
        if (!priorizacao) continue;
        
        const dataAbertura = new Date(vaga.criado_em);
        const dataFechamento = new Date(vaga.fechado_em);
        const diasParaFechar = Math.ceil(
          (dataFechamento.getTime() - dataAbertura.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        const candidatoAprovado = Array.isArray(vaga.candidaturas)
          ? vaga.candidaturas.some((c: any) => c.status === 'aprovado')
          : false;
        
        vagasFechadas.push({
          vaga_id: vaga.id,
          vaga_titulo: vaga.titulo,
          nivel_prioridade: priorizacao.nivel_prioridade,
          sla_dias: priorizacao.sla_dias,
          dias_para_fechar: diasParaFechar,
          fechou_no_sla: diasParaFechar <= priorizacao.sla_dias,
          candidato_aprovado: candidatoAprovado,
          data_abertura: vaga.criado_em,
          data_fechamento: vaga.fechado_em
        });
      }
      
      return vagasFechadas;
      
    } catch (error) {
      console.error('Erro ao buscar vagas fechadas:', error);
      return [];
    }
  }
  
  // ============================================
  // GERAR INSIGHTS
  // ============================================
  
  private gerarInsights(
    taxaConcordancia: number,
    taxaSucessoIA: number,
    taxaSucessoHumano: number,
    decisoes: DecisaoHumana[],
    vagasFechadas: VagaFechada[]
  ): string[] {
    const insights: string[] = [];
    
    // Insight 1: Concordância
    if (taxaConcordancia >= 80) {
      insights.push(`✅ Alta concordância (${taxaConcordancia.toFixed(1)}%) - A IA está alinhada com as decisões humanas.`);
    } else if (taxaConcordancia >= 60) {
      insights.push(`⚠️ Concordância moderada (${taxaConcordancia.toFixed(1)}%) - Revisar critérios de priorização.`);
    } else {
      insights.push(`❌ Baixa concordância (${taxaConcordancia.toFixed(1)}%) - IA precisa de ajustes significativos.`);
    }
    
    // Insight 2: Sucesso IA vs Humano
    if (taxaSucessoIA > taxaSucessoHumano) {
      const diferenca = taxaSucessoIA - taxaSucessoHumano;
      insights.push(`🤖 IA teve ${diferenca.toFixed(1)}% mais sucesso que decisões humanas - Considere confiar mais nas recomendações.`);
    } else if (taxaSucessoHumano > taxaSucessoIA) {
      const diferenca = taxaSucessoHumano - taxaSucessoIA;
      insights.push(`👤 Decisões humanas tiveram ${diferenca.toFixed(1)}% mais sucesso - IA precisa aprender com esses casos.`);
    } else {
      insights.push(`⚖️ IA e humanos tiveram taxa de sucesso similar - Sistema equilibrado.`);
    }
    
    // Insight 3: Padrões de alteração
    const alteracoesPorNivel = decisoes
      .filter(d => d.foi_alterado)
      .reduce((acc, d) => {
        const chave = `${d.nivel_ia} → ${d.nivel_humano}`;
        acc[chave] = (acc[chave] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    const alteracaoMaisComum = Object.entries(alteracoesPorNivel)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (alteracaoMaisComum) {
      insights.push(`📊 Alteração mais comum: ${alteracaoMaisComum[0]} (${alteracaoMaisComum[1]} vezes)`);
    }
    
    // Insight 4: SLA
    const vagasForaSLA = vagasFechadas.filter(v => !v.fechou_no_sla).length;
    const taxaForaSLA = vagasFechadas.length > 0
      ? (vagasForaSLA / vagasFechadas.length) * 100
      : 0;
    
    if (taxaForaSLA > 30) {
      insights.push(`⏰ ${taxaForaSLA.toFixed(1)}% das vagas fecharam fora do SLA - Revisar prazos ou capacidade.`);
    }
    
    return insights;
  }
  
  // ============================================
  // SALVAR RELATÓRIO
  // ============================================
  
  async salvarRelatorio(relatorio: RelatorioAprendizado): Promise<void> {
    try {
      // TODO: Criar tabela para salvar relatórios mensais
      console.log('Relatório gerado:', relatorio);
    } catch (error) {
      console.error('Erro ao salvar relatório:', error);
      throw error;
    }
  }
}

export const priorizacaoAprendizadoService = new PriorizacaoAprendizadoService();
