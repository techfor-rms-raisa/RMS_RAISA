/**
 * CRON JOBS SERVICE
 * Gerencia tarefas agendadas: repriorização a cada 4h e análise mensal
 */

import { supabase } from '../config/supabase';
import { suggestReprioritization } from './geminiService';
import { notificacaoService } from './notificacaoService';
import { priorizacaoAprendizadoService } from './priorizacaoAprendizadoService';

class CronJobsService {
  
  // ============================================
  // REPRIORIZAÇÃO DINÂMICA (A CADA 4 HORAS)
  // ============================================
  
  /**
   * Executa repriorização dinâmica de todas as vagas em andamento
   * Deve ser executado a cada 4 horas via cron job
   */
  async executarRepriorizacaoDinamica(): Promise<void> {
    console.log('[CRON] Iniciando repriorização dinâmica...');
    
    try {
      // Buscar vagas em andamento
      const { data: vagas, error } = await supabase
        .from('vagas')
        .select(`
          id,
          titulo,
          criado_em,
          vaga_priorizacao (
            score_prioridade,
            nivel_prioridade,
            sla_dias,
            atualizado_em
          ),
          candidaturas (count)
        `)
        .in('status_workflow', ['priorizada_e_distribuida', 'em_andamento'])
        .eq('status', 'aberta');
      
      if (error) throw error;
      
      if (!vagas || vagas.length === 0) {
        console.log('[CRON] Nenhuma vaga em andamento para repriorizar.');
        return;
      }
      
      console.log(`[CRON] Analisando ${vagas.length} vagas...`);
      
      let sugestoesGeradas = 0;
      
      for (const vaga of vagas) {
        try {
          const priorizacao = Array.isArray(vaga.vaga_priorizacao)
            ? vaga.vaga_priorizacao[0]
            : vaga.vaga_priorizacao;
          
          if (!priorizacao) continue;
          
          // Calcular métricas
          const dataAbertura = new Date(vaga.criado_em);
          const agora = new Date();
          const diasVagaAberta = Math.ceil(
            (agora.getTime() - dataAbertura.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          const dataUltimaAtualizacao = new Date(priorizacao.atualizado_em || vaga.criado_em);
          const ultimaAtualizacaoDias = Math.ceil(
            (agora.getTime() - dataUltimaAtualizacao.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          const candidaturasRecebidas = Array.isArray(vaga.candidaturas)
            ? vaga.candidaturas.length
            : 0;
          
          // Buscar candidatos em processo
          const { count: candidatosEmProcesso } = await supabase
            .from('candidaturas')
            .select('*', { count: 'exact', head: true })
            .eq('vaga_id', vaga.id)
            .in('status', ['triagem', 'entrevista', 'cliente']);
          
          // ✅ Calcular média real de dias para fechar vagas (últimos 6 meses)
          let mediaMercadoDias = 30; // Fallback
          try {
            const seisAnesMesesAtras = new Date();
            seisAnesMesesAtras.setMonth(seisAnesMesesAtras.getMonth() - 6);
            
            const { data: vagasFechadas } = await supabase
              .from('vagas')
              .select('criado_em, fechado_em')
              .eq('status', 'fechada')
              .not('fechado_em', 'is', null)
              .gte('fechado_em', seisAnesMesesAtras.toISOString());
            
            if (vagasFechadas && vagasFechadas.length > 0) {
              const diasParaFechar = vagasFechadas.map(v => {
                const inicio = new Date(v.criado_em).getTime();
                const fim = new Date(v.fechado_em).getTime();
                return Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24));
              });
              mediaMercadoDias = Math.round(
                diasParaFechar.reduce((a, b) => a + b, 0) / diasParaFechar.length
              );
            }
          } catch (e) {
            console.warn('⚠️ Usando fallback para média de mercado');
          }
          
          // Solicitar análise da IA
          const sugestao = await suggestReprioritization({
            vaga_id: vaga.id,
            titulo_vaga: vaga.titulo,
            score_atual: priorizacao.score_prioridade,
            nivel_atual: priorizacao.nivel_prioridade,
            sla_atual: priorizacao.sla_dias,
            dias_vaga_aberta: diasVagaAberta,
            candidaturas_recebidas: candidaturasRecebidas,
            candidatos_em_processo: candidatosEmProcesso || 0,
            ultima_atualizacao_dias: ultimaAtualizacaoDias,
            media_mercado_dias: mediaMercadoDias
          });
          
          // Se IA sugerir repriorização, salvar
          if (sugestao.deve_reprioritizar) {
            await this.salvarSugestaoRepriorizacao(
              vaga.id,
              priorizacao.score_prioridade,
              priorizacao.nivel_prioridade,
              priorizacao.sla_dias,
              sugestao
            );
            
            sugestoesGeradas++;
            
            // Notificar Gestor de R&S
            await this.notificarGestorRepriorizacao(
              vaga.id,
              vaga.titulo,
              priorizacao.nivel_prioridade,
              sugestao.nivel_sugerido || 'N/A'
            );
          }
          
        } catch (vagaError) {
          console.error(`[CRON] Erro ao analisar vaga ${vaga.id}:`, vagaError);
          // Continuar com próxima vaga
        }
      }
      
      console.log(`[CRON] Repriorização concluída. ${sugestoesGeradas} sugestões geradas.`);
      
    } catch (error) {
      console.error('[CRON] Erro na repriorização dinâmica:', error);
      throw error;
    }
  }
  
  private async salvarSugestaoRepriorizacao(
    vagaId: number,
    scoreAtual: number,
    nivelAtual: string,
    slaAtual: number,
    sugestao: any
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('vaga_repriorizacao_sugestao')
        .insert({
          vaga_id: vagaId,
          score_atual: scoreAtual,
          nivel_atual: nivelAtual,
          sla_atual: slaAtual,
          score_sugerido: sugestao.score_sugerido,
          nivel_sugerido: sugestao.nivel_sugerido,
          sla_sugerido: sugestao.sla_sugerido,
          motivo_mudanca: sugestao.motivo_mudanca,
          contexto_analise: {
            urgencia: sugestao.urgencia,
            timestamp: new Date().toISOString()
          },
          status: 'pendente'
        });
      
      if (error) throw error;
    } catch (error) {
      console.error('Erro ao salvar sugestão de repriorização:', error);
      throw error;
    }
  }
  
  private async notificarGestorRepriorizacao(
    vagaId: number,
    vagaTitulo: string,
    nivelAtual: string,
    nivelSugerido: string
  ): Promise<void> {
    try {
      // Buscar gestores de R&S
      const { data: gestores } = await supabase
        .from('app_users')
        .select('id')
        .eq('role', 'Gestão de Pessoas')
        .eq('ativo', true);
      
      if (!gestores || gestores.length === 0) return;
      
      for (const gestor of gestores) {
        await notificacaoService.notificarSugestaoRepriorizacao(
          gestor.id,
          vagaId,
          vagaTitulo,
          nivelAtual,
          nivelSugerido
        );
      }
    } catch (error) {
      console.error('Erro ao notificar gestor:', error);
    }
  }
  
  // ============================================
  // ANÁLISE MENSAL (TODO DIA 1 DO MÊS)
  // ============================================
  
  /**
   * Executa análise mensal de aprendizado
   * Deve ser executado no dia 1 de cada mês via cron job
   */
  async executarAnaliseMensal(): Promise<void> {
    console.log('[CRON] Iniciando análise mensal de aprendizado...');
    
    try {
      // Calcular mês anterior
      const agora = new Date();
      const mesAnterior = agora.getMonth() === 0 ? 12 : agora.getMonth();
      const anoAnterior = agora.getMonth() === 0 ? agora.getFullYear() - 1 : agora.getFullYear();
      
      // Gerar relatório
      const relatorio = await priorizacaoAprendizadoService.gerarRelatorioMensal(
        mesAnterior,
        anoAnterior
      );
      
      // Salvar relatório
      await priorizacaoAprendizadoService.salvarRelatorio(relatorio);
      
      // Notificar gestores
      await this.notificarGestoresRelatorioMensal(relatorio);
      
      console.log(`[CRON] Análise mensal concluída para ${relatorio.periodo}`);
      
    } catch (error) {
      console.error('[CRON] Erro na análise mensal:', error);
      throw error;
    }
  }
  
  private async notificarGestoresRelatorioMensal(relatorio: any): Promise<void> {
    try {
      // Buscar gestores de R&S
      const { data: gestores } = await supabase
        .from('app_users')
        .select('id')
        .eq('role', 'Gestão de Pessoas')
        .eq('ativo', true);
      
      if (!gestores || gestores.length === 0) return;
      
      for (const gestor of gestores) {
        await notificacaoService.criar(
          gestor.id,
          'relatorio_mensal',
          '📊 Relatório Mensal de Aprendizado IA',
          `O relatório de aprendizado de ${relatorio.periodo} está disponível. Taxa de concordância: ${relatorio.taxa_concordancia.toFixed(1)}%`,
          '/dashboard/aprendizado-ia',
          {
            periodo: relatorio.periodo,
            taxa_concordancia: relatorio.taxa_concordancia,
            taxa_sucesso_ia: relatorio.taxa_sucesso_ia,
            taxa_sucesso_humano: relatorio.taxa_sucesso_humano
          }
        );
      }
    } catch (error) {
      console.error('Erro ao notificar gestores:', error);
    }
  }
  
  // ============================================
  // LIMPEZA DE NOTIFICAÇÕES ANTIGAS (SEMANAL)
  // ============================================
  
  /**
   * Limpa notificações lidas com mais de 30 dias
   * Deve ser executado semanalmente via cron job
   */
  async executarLimpezaNotificacoes(): Promise<void> {
    console.log('[CRON] Iniciando limpeza de notificações antigas...');
    
    try {
      await notificacaoService.limparAntigas(30);
      console.log('[CRON] Limpeza de notificações concluída.');
    } catch (error) {
      console.error('[CRON] Erro na limpeza de notificações:', error);
      throw error;
    }
  }
}

export const cronJobsService = new CronJobsService();

// ============================================
// SETUP DE CRON JOBS (PARA VERCEL/NETLIFY)
// ============================================

/**
 * SETUP DE CRON JOBS PARA VERCEL
 * 
 * Criar arquivos em /api/cron/ para cada job:
 * - repriorizacao.ts (executa a cada 4 horas)
 * - analise-mensal.ts (executa dia 1 de cada mês)
 * - limpeza-notificacoes.ts (executa semanalmente)
 * 
 * Configurar vercel.json com os cron schedules apropriados.
 * Consultar documentação completa em docs/cron-setup.md
 */
