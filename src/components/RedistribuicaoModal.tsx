/**
 * COMPONENTE: MODAL DE REDISTRIBUIÇÃO DE VAGA
 * Permite ao Gestor redistribuir uma vaga para outro analista
 */

import React, { useState, useEffect } from 'react';
import { X, RefreshCw, User, AlertCircle, Loader2 } from 'lucide-react';
import { vagaWorkflowService } from '../services/vagaWorkflowService';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabase';

interface RedistribuicaoModalProps {
  vagaId: number;
  onClose: () => void;
  onRedistribuido: () => void;
}

interface AnalistaDisponivel {
  id: number;
  nome: string;
  vagas_ativas: number;
  taxa_aprovacao: number;
}

export function RedistribuicaoModal({ 
  vagaId, 
  onClose, 
  onRedistribuido 
}: RedistribuicaoModalProps) {
  const { user } = useAuth();
  
  const [analistas, setAnalistas] = useState<AnalistaDisponivel[]>([]);
  const [analistaSelecionado, setAnalistaSelecionado] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingAnalistas, setLoadingAnalistas] = useState(true);

  useEffect(() => {
    carregarAnalistas();
  }, []);

  const carregarAnalistas = async () => {
    setLoadingAnalistas(true);
    try {
      // ✅ Buscar analistas da view vw_performance_analista
      const { data, error } = await supabase
        .from('vw_performance_analista')
        .select('analista_id, analista_nome, vagas_ativas, taxa_aprovacao')
        .order('taxa_aprovacao', { ascending: false });

      if (error) throw error;

      const analistasFormatados: AnalistaDisponivel[] = (data || []).map(a => ({
        id: a.analista_id,
        nome: a.analista_nome || 'Analista',
        vagas_ativas: a.vagas_ativas || 0,
        taxa_aprovacao: Math.round(a.taxa_aprovacao || 0)
      }));

      setAnalistas(analistasFormatados);
      console.log(`✅ ${analistasFormatados.length} analistas carregados para redistribuição`);
    } catch (error) {
      console.error('❌ Erro ao carregar analistas:', error);
      // Fallback: buscar da tabela app_users
      try {
        const { data: usersData } = await supabase
          .from('app_users')
          .select('id, nome_usuario')
          .eq('tipo_usuario', 'Analista de R&S')
          .eq('ativo_usuario', true);
        
        setAnalistas((usersData || []).map(u => ({
          id: u.id,
          nome: u.nome_usuario,
          vagas_ativas: 0,
          taxa_aprovacao: 0
        })));
      } catch (fallbackError) {
        console.error('❌ Fallback também falhou:', fallbackError);
        setAnalistas([]);
      }
    } finally {
      setLoadingAnalistas(false);
    }
  };

  const handleRedistribuir = async () => {
    if (!user || !analistaSelecionado || !motivo.trim()) {
      alert('Selecione um analista e informe o motivo da redistribuição.');
      return;
    }

    const analista = analistas.find(a => a.id === analistaSelecionado);
    if (!analista) return;

    setLoading(true);
    try {
      await vagaWorkflowService.redistribuirVaga(
        vagaId,
        analista.id,
        analista.nome,
        motivo,
        user.id,
        user.nome
      );
      onRedistribuido();
    } catch (error) {
      console.error('Erro ao redistribuir vaga:', error);
      alert('Erro ao redistribuir vaga. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-6 h-6 text-orange-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Redistribuir Vaga
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
          {/* Alerta */}
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900 mb-1">
                Atenção: Redistribuição Manual
              </p>
              <p className="text-sm text-yellow-700">
                Esta ação irá transferir a vaga para outro analista. O histórico será registrado para aprendizado da IA.
              </p>
            </div>
          </div>

          {/* Seleção de Analista */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Selecione o Novo Analista
            </label>
            {loadingAnalistas ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                <span className="ml-2 text-gray-600">Carregando analistas...</span>
              </div>
            ) : analistas.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nenhum analista disponível encontrado.
              </div>
            ) : (
            <div className="space-y-2">
              {analistas.map((analista) => (
                <div
                  key={analista.id}
                  onClick={() => setAnalistaSelecionado(analista.id)}
                  className={`
                    p-4 border-2 rounded-lg cursor-pointer transition-all
                    ${analistaSelecionado === analista.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center
                        ${analistaSelecionado === analista.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-600'
                        }
                      `}>
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {analista.nome}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {analista.vagas_ativas} {analista.vagas_ativas === 1 ? 'vaga ativa' : 'vagas ativas'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-sm text-gray-500 mb-1">Taxa de Aprovação</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {analista.taxa_aprovacao}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Motivo da Redistribuição *
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="Ex: Analista atual está sobrecarregado, novo analista tem melhor fit com a stack, etc."
            />
            <p className="mt-1 text-xs text-gray-500">
              Este motivo será registrado para análise mensal de aprendizado da IA.
            </p>
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
            onClick={handleRedistribuir}
            disabled={loading || !analistaSelecionado || !motivo.trim()}
            className="flex items-center gap-2 px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4" />
            {loading ? 'Redistribuindo...' : 'Redistribuir Vaga'}
          </button>
        </div>
      </div>
    </div>
  );
}
