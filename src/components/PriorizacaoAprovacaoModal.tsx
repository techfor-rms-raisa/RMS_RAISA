/**
 * COMPONENTE: MODAL DE APROVAÇÃO DE PRIORIZAÇÃO
 * Permite ao Gestor aprovar ou ajustar a priorização calculada pela IA
 */

import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Target, TrendingUp, Clock, DollarSign, Loader2 } from 'lucide-react';
import { vagaWorkflowService } from '../services/vagaWorkflowService';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabase';

interface PriorizacaoAprovacaoModalProps {
  vagaId: number;
  onClose: () => void;
  onAprovado: () => void;
}

interface PriorizacaoData {
  score_prioridade: number;
  nivel_prioridade: string;
  sla_dias: number;
  justificativa: string;
  fatores_considerados: {
    urgencia_prazo: number;
    valor_faturamento: number;
    cliente_vip: boolean;
    tempo_vaga_aberta: number;
    complexidade_stack: number;
  };
}

export function PriorizacaoAprovacaoModal({ 
  vagaId, 
  onClose, 
  onAprovado 
}: PriorizacaoAprovacaoModalProps) {
  const { user } = useAuth();
  
  const [priorizacao, setPriorizacao] = useState<PriorizacaoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDados, setLoadingDados] = useState(true);

  useEffect(() => {
    carregarPriorizacao();
  }, [vagaId]);

  const carregarPriorizacao = async () => {
    setLoadingDados(true);
    try {
      // ✅ Buscar priorização da view vw_ranking_priorizacao ou tabela vaga_priorizacao
      const { data, error } = await supabase
        .from('vaga_priorizacao')
        .select(`
          score_prioridade,
          nivel_prioridade,
          sla_dias,
          justificativa,
          score_urgencia,
          score_faturamento,
          score_velocidade,
          score_tempo_aberto,
          score_cliente_vip,
          dias_restantes
        `)
        .eq('vaga_id', vagaId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setPriorizacao({
          score_prioridade: data.score_prioridade || 50,
          nivel_prioridade: data.nivel_prioridade || 'Média',
          sla_dias: data.sla_dias || 15,
          justificativa: data.justificativa || 'Priorização calculada automaticamente.',
          fatores_considerados: {
            urgencia_prazo: data.score_urgencia || 50,
            valor_faturamento: data.score_faturamento || 50,
            cliente_vip: (data.score_cliente_vip || 0) > 0,
            tempo_vaga_aberta: data.dias_restantes || 0,
            complexidade_stack: data.score_velocidade || 50
          }
        });
        console.log('✅ Priorização carregada do Supabase');
      } else {
        // Fallback: buscar dados da vaga para calcular priorização básica
        const { data: vagaData } = await supabase
          .from('vagas')
          .select('urgente, prazo_fechamento, faturamento_mensal, cliente_id, criado_em')
          .eq('id', vagaId)
          .single();

        // Buscar se cliente é VIP
        let clienteVip = false;
        if (vagaData?.cliente_id) {
          const { data: clienteData } = await supabase
            .from('clients')
            .select('vip')
            .eq('id', vagaData.cliente_id)
            .single();
          clienteVip = clienteData?.vip || false;
        }

        // Calcular dias em aberto
        const diasAberto = vagaData?.criado_em 
          ? Math.floor((Date.now() - new Date(vagaData.criado_em).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        // Calcular score básico
        let scoreBase = 50;
        if (vagaData?.urgente) scoreBase += 30;
        if (clienteVip) scoreBase += 20;
        if (diasAberto > 15) scoreBase += 10;

        setPriorizacao({
          score_prioridade: Math.min(scoreBase, 100),
          nivel_prioridade: scoreBase >= 80 ? 'Alta' : scoreBase >= 50 ? 'Média' : 'Baixa',
          sla_dias: vagaData?.urgente ? 7 : 15,
          justificativa: 'Priorização calculada com base nos dados da vaga.',
          fatores_considerados: {
            urgencia_prazo: vagaData?.urgente ? 90 : 50,
            valor_faturamento: vagaData?.faturamento_mensal ? 80 : 50,
            cliente_vip: clienteVip,
            tempo_vaga_aberta: diasAberto,
            complexidade_stack: 50
          }
        });
        console.log('⚠️ Priorização calculada localmente (sem dados na tabela)');
      }
    } catch (error) {
      console.error('❌ Erro ao carregar priorização:', error);
      // Fallback mínimo
      setPriorizacao({
        score_prioridade: 50,
        nivel_prioridade: 'Média',
        sla_dias: 15,
        justificativa: 'Não foi possível carregar a priorização.',
        fatores_considerados: {
          urgencia_prazo: 50,
          valor_faturamento: 50,
          cliente_vip: false,
          tempo_vaga_aberta: 0,
          complexidade_stack: 50
        }
      });
    } finally {
      setLoadingDados(false);
    }
  };

  const handleAprovar = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await vagaWorkflowService.aprovarPriorizacao(vagaId, user.id);
      onAprovado();
    } catch (error) {
      console.error('Erro ao aprovar priorização:', error);
      alert('Erro ao aprovar priorização. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const getNivelColor = (nivel: string) => {
    switch (nivel) {
      case 'Alta':
        return 'text-red-600 bg-red-100';
      case 'Média':
        return 'text-yellow-600 bg-yellow-100';
      case 'Baixa':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-red-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (loadingDados || !priorizacao) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 flex items-center gap-3">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          <span className="text-gray-600">Carregando priorização...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Revisar Priorização Calculada pela IA
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Score e Nível */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Score de Prioridade</span>
              </div>
              <div className={`text-3xl font-bold ${getScoreColor(priorizacao.score_prioridade)}`}>
                {priorizacao.score_prioridade}
                <span className="text-lg text-gray-500">/100</span>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border-2 border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Nível de Prioridade</span>
              </div>
              <div>
                <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${getNivelColor(priorizacao.nivel_prioridade)}`}>
                  {priorizacao.nivel_prioridade}
                </span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-purple-900">SLA Sugerido</span>
              </div>
              <div className="text-3xl font-bold text-purple-600">
                {priorizacao.sla_dias}
                <span className="text-lg text-gray-500"> dias</span>
              </div>
            </div>
          </div>

          {/* Justificativa */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Justificativa da IA
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-700">
                {priorizacao.justificativa}
              </p>
            </div>
          </div>

          {/* Fatores Considerados */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Fatores Considerados
            </h3>
            <div className="space-y-3">
              {/* Urgência do Prazo */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">Urgência do Prazo</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {priorizacao.fatores_considerados.urgencia_prazo}/100
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-red-500 h-2 rounded-full transition-all"
                    style={{ width: `${priorizacao.fatores_considerados.urgencia_prazo}%` }}
                  />
                </div>
              </div>

              {/* Valor de Faturamento */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">Valor de Faturamento</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {priorizacao.fatores_considerados.valor_faturamento}/100
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${priorizacao.fatores_considerados.valor_faturamento}%` }}
                  />
                </div>
              </div>

              {/* Cliente VIP */}
              <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Cliente VIP</span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  priorizacao.fatores_considerados.cliente_vip 
                    ? 'bg-yellow-200 text-yellow-800' 
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {priorizacao.fatores_considerados.cliente_vip ? 'SIM (+20 pontos)' : 'NÃO'}
                </span>
              </div>

              {/* Tempo em Aberto */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">Tempo em Aberto</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {priorizacao.fatores_considerados.tempo_vaga_aberta} dias
                  </span>
                </div>
              </div>

              {/* Complexidade da Stack */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">Complexidade da Stack</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {priorizacao.fatores_considerados.complexidade_stack}/100
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${priorizacao.fatores_considerados.complexidade_stack}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          
          <button
            onClick={handleAprovar}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            {loading ? 'Aprovando...' : 'Aprovar Priorização'}
          </button>
        </div>
      </div>
    </div>
  );
}
