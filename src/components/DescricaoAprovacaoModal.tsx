/**
 * COMPONENTE: MODAL DE APROVAÇÃO DE DESCRIÇÃO
 * Permite ao Gestor aprovar, editar ou rejeitar a descrição melhorada pela IA
 */

import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Edit3, XCircle, Sparkles, Loader2 } from 'lucide-react';
import { vagaWorkflowService } from '../services/vagaWorkflowService';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabase';

interface DescricaoAprovacaoModalProps {
  vagaId: number;
  onClose: () => void;
  onAprovado: () => void;
}

interface MudancaSugerida {
  tipo: string;
  motivo: string;
  antes: string;
  depois: string;
}

export function DescricaoAprovacaoModal({ 
  vagaId, 
  onClose, 
  onAprovado 
}: DescricaoAprovacaoModalProps) {
  const { user } = useAuth();
  
  const [descricaoOriginal, setDescricaoOriginal] = useState('');
  const [descricaoMelhorada, setDescricaoMelhorada] = useState('');
  const [descricaoEditada, setDescricaoEditada] = useState('');
  const [modoEdicao, setModoEdicao] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDados, setLoadingDados] = useState(true);
  const [mudancas, setMudancas] = useState<MudancaSugerida[]>([]);

  useEffect(() => {
    carregarDescricoes();
  }, [vagaId]);

  const carregarDescricoes = async () => {
    setLoadingDados(true);
    try {
      // ✅ Buscar análise da IA para esta vaga
      const { data: analiseData, error: analiseError } = await supabase
        .from('vaga_analise_ia')
        .select('descricao_original, sugestoes, ajustes, campos_ajustados')
        .eq('vaga_id', vagaId)
        .order('analisado_em', { ascending: false })
        .limit(1)
        .single();

      if (analiseError && analiseError.code !== 'PGRST116') {
        throw analiseError;
      }

      if (analiseData) {
        setDescricaoOriginal(analiseData.descricao_original || '');
        
        // Extrair descrição melhorada das sugestões
        const sugestoes = analiseData.sugestoes || {};
        const descricaoSugerida = sugestoes.descricao_melhorada || 
                                  sugestoes.descricao || 
                                  analiseData.descricao_original || '';
        setDescricaoMelhorada(descricaoSugerida);
        setDescricaoEditada(descricaoSugerida);

        // Extrair mudanças sugeridas
        const ajustes = analiseData.ajustes || [];
        if (Array.isArray(ajustes) && ajustes.length > 0) {
          setMudancas(ajustes.map((a: any) => ({
            tipo: a.campo || a.tipo || 'Ajuste',
            motivo: a.justificativa || a.motivo || '',
            antes: a.valor_original || a.antes || '',
            depois: a.valor_sugerido || a.depois || ''
          })));
        }
        
        console.log('✅ Descrições carregadas da análise IA');
      } else {
        // Fallback: buscar descrição direto da vaga
        const { data: vagaData } = await supabase
          .from('vagas')
          .select('descricao')
          .eq('id', vagaId)
          .single();

        if (vagaData) {
          setDescricaoOriginal(vagaData.descricao || '');
          setDescricaoMelhorada(vagaData.descricao || '');
          setDescricaoEditada(vagaData.descricao || '');
        }
        console.log('⚠️ Sem análise IA - usando descrição original da vaga');
      }
    } catch (error) {
      console.error('❌ Erro ao carregar descrições:', error);
      setDescricaoOriginal('Erro ao carregar descrição original.');
      setDescricaoMelhorada('Erro ao carregar descrição melhorada.');
    } finally {
      setLoadingDados(false);
    }
  };

  const handleAprovar = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await vagaWorkflowService.aprovarDescricao(
        vagaId,
        'aprovado',
        null,
        user.id,
        user.nome
      );
      onAprovado();
    } catch (error) {
      console.error('Erro ao aprovar:', error);
      alert('Erro ao aprovar descrição. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditarEAprovar = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await vagaWorkflowService.aprovarDescricao(
        vagaId,
        'editado_e_aprovado',
        descricaoEditada,
        user.id,
        user.nome
      );
      onAprovado();
    } catch (error) {
      console.error('Erro ao aprovar com edição:', error);
      alert('Erro ao aprovar descrição editada. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleRejeitar = async () => {
    if (!user) return;
    
    if (!confirm('Tem certeza que deseja rejeitar a descrição melhorada? A vaga voltará ao status de rascunho.')) {
      return;
    }
    
    setLoading(true);
    try {
      await vagaWorkflowService.aprovarDescricao(
        vagaId,
        'rejeitado',
        null,
        user.id,
        user.nome
      );
      onAprovado();
    } catch (error) {
      console.error('Erro ao rejeitar:', error);
      alert('Erro ao rejeitar descrição. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Revisar Descrição Melhorada pela IA
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
          {loadingDados ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <span className="ml-3 text-gray-600">Carregando descrições...</span>
            </div>
          ) : (
          <>
          <div className="grid grid-cols-2 gap-6">
            {/* Descrição Original */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-gray-400 rounded-full" />
                Descrição Original
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 h-96 overflow-y-auto">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {descricaoOriginal}
                </p>
              </div>
            </div>

            {/* Descrição Melhorada */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                Descrição Melhorada pela IA
              </h3>
              
              {modoEdicao ? (
                <textarea
                  value={descricaoEditada}
                  onChange={(e) => setDescricaoEditada(e.target.value)}
                  className="w-full h-96 p-4 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Edite a descrição..."
                />
              ) : (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 h-96 overflow-y-auto">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {descricaoMelhorada}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Mudanças Sugeridas */}
          {mudancas.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Principais Mudanças Realizadas pela IA
              </h3>
              <div className="space-y-2">
                {mudancas.map((mudanca, index) => (
                  <div 
                    key={index}
                    className="bg-white border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                        {mudanca.tipo}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-600 mb-1">
                          {mudanca.motivo}
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">Antes:</span>
                            <p className="text-gray-700 line-clamp-2">{mudanca.antes}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Depois:</span>
                            <p className="text-gray-700 line-clamp-2">{mudanca.depois}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex gap-2">
            <button
              onClick={handleRejeitar}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Rejeitar
            </button>
          </div>

          <div className="flex gap-3">
            {!modoEdicao ? (
              <>
                <button
                  onClick={() => setModoEdicao(true)}
                  className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <Edit3 className="w-4 h-4" />
                  Editar Antes de Aprovar
                </button>
                
                <button
                  onClick={handleAprovar}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  {loading ? 'Aprovando...' : 'Aprovar'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setModoEdicao(false);
                    setDescricaoEditada(descricaoMelhorada);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar Edição
                </button>
                
                <button
                  onClick={handleEditarEAprovar}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  {loading ? 'Salvando...' : 'Salvar e Aprovar'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
