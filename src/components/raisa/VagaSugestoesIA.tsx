/**
 * VagaSugestoesIA.tsx - Componente de Sugestões de Vaga por IA
 * 
 * Exibe análise da IA sobre a vaga e permite aplicar sugestões
 * 
 * Versão: 1.1
 * Data: 06/01/2026
 * 
 * v1.1: Fix botão "Aplicar Sugestões" / "Concluir Análise"
 *       - Se há sugestões selecionáveis: mostra "Aplicar (N) Sugestões"
 *       - Se não há (apenas keywords/dicas): mostra "✓ Concluir Análise"
 */

import React, { useState, useEffect } from 'react';
import { Vaga } from '../../types/types_index';
import { useVagaAnaliseIA, VagaAnaliseIADB, SugestaoIA } from '../../hooks/supabase/useVagaAnaliseIA';

interface VagaSugestoesIAProps {
  vaga: Vaga;
  onClose: () => void;
  onAplicarSugestoes?: (vagaAtualizada: Partial<Vaga>) => void;
  currentUserId: number;
}

const VagaSugestoesIA: React.FC<VagaSugestoesIAProps> = ({
  vaga,
  onClose,
  onAplicarSugestoes,
  currentUserId
}) => {
  const {
    analiseAtual,
    loading,
    error,
    analisarVaga,
    loadAnaliseVaga,
    aplicarSugestoes,
    rejeitarAnalise
  } = useVagaAnaliseIA();

  const [sugestoesSelecionadas, setSugestoesSelecionadas] = useState<string[]>([]);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [showRejeicao, setShowRejeicao] = useState(false);

  // Carregar ou gerar análise ao abrir
  useEffect(() => {
    const carregarAnalise = async () => {
      // Primeiro tenta carregar análise existente
      const analiseExistente = await loadAnaliseVaga(parseInt(vaga.id));
      
      // Se não existe ou foi aprovada, gerar nova
      if (!analiseExistente || analiseExistente.aprovado) {
        await analisarVaga(vaga);
      }
    };
    
    carregarAnalise();
  }, [vaga.id]);

  // Função para alternar seleção de sugestão
  const toggleSugestao = (campo: string) => {
    setSugestoesSelecionadas(prev => 
      prev.includes(campo) 
        ? prev.filter(c => c !== campo)
        : [...prev, campo]
    );
  };

  // Verificar se há sugestões de campos selecionáveis
  const temSugestoesSelecionaveis = analiseAtual?.sugestoes && 
    Object.keys(analiseAtual.sugestoes).filter(k => 
      analiseAtual.sugestoes[k as keyof typeof analiseAtual.sugestoes] && 
      typeof analiseAtual.sugestoes[k as keyof typeof analiseAtual.sugestoes] === 'object' &&
      'sugerido' in (analiseAtual.sugestoes[k as keyof typeof analiseAtual.sugestoes] as any)
    ).length > 0;

  // Aplicar sugestões selecionadas ou concluir análise
  const handleAplicar = async () => {
    if (!analiseAtual) return;
    
    // Se não há sugestões selecionáveis, apenas marcar como aprovado e fechar
    if (!temSugestoesSelecionaveis) {
      const sucesso = await aplicarSugestoes(
        analiseAtual.id,
        parseInt(vaga.id),
        ['analise_revisada'],  // Marca que foi revisado
        currentUserId
      );
      if (sucesso) {
        onClose();
      }
      return;
    }
    
    // Se há sugestões selecionáveis mas nenhuma foi selecionada
    if (sugestoesSelecionadas.length === 0) return;
    
    const sucesso = await aplicarSugestoes(
      analiseAtual.id,
      parseInt(vaga.id),
      sugestoesSelecionadas,
      currentUserId
    );

    if (sucesso) {
      // Notificar componente pai sobre as mudanças
      if (onAplicarSugestoes && analiseAtual.sugestoes) {
        const atualizacoes: Partial<Vaga> = {};
        sugestoesSelecionadas.forEach(campo => {
          const sugestao = analiseAtual.sugestoes[campo as keyof typeof analiseAtual.sugestoes];
          if (sugestao && typeof sugestao === 'object' && 'sugerido' in sugestao) {
            (atualizacoes as any)[campo] = sugestao.sugerido;
          }
        });
        onAplicarSugestoes(atualizacoes);
      }
      onClose();
    }
  };

  // Rejeitar análise
  const handleRejeitar = async () => {
    if (!analiseAtual || !motivoRejeicao.trim()) return;
    
    const sucesso = await rejeitarAnalise(analiseAtual.id, motivoRejeicao, currentUserId);
    if (sucesso) {
      onClose();
    }
  };

  // Renderizar card de sugestão
  const renderSugestaoCard = (campo: string, sugestao: SugestaoIA) => {
    const isSelected = sugestoesSelecionadas.includes(campo);
    const prioridadeColors = {
      alta: 'border-red-400 bg-red-50',
      media: 'border-yellow-400 bg-yellow-50',
      baixa: 'border-green-400 bg-green-50'
    };

    return (
      <div
        key={campo}
        className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
          isSelected 
            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
            : prioridadeColors[sugestao.prioridade]
        }`}
        onClick={() => toggleSugestao(campo)}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSugestao(campo)}
              className="w-5 h-5 text-blue-600 rounded"
            />
            <span className="font-bold text-gray-800 capitalize">{campo.replace('_', ' ')}</span>
          </div>
          <span className={`text-xs px-2 py-1 rounded uppercase font-bold ${
            sugestao.prioridade === 'alta' ? 'bg-red-200 text-red-800' :
            sugestao.prioridade === 'media' ? 'bg-yellow-200 text-yellow-800' :
            'bg-green-200 text-green-800'
          }`}>
            {sugestao.prioridade}
          </span>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-500">Original:</span>
            <p className="text-gray-700 bg-gray-100 p-2 rounded mt-1 line-clamp-2">
              {sugestao.original || '(vazio)'}
            </p>
          </div>
          <div>
            <span className="text-green-600 font-medium">Sugestão:</span>
            <p className="text-gray-800 bg-green-100 p-2 rounded mt-1">
              {sugestao.sugerido}
            </p>
          </div>
          <p className="text-gray-500 italic text-xs">
            💡 {sugestao.motivo}
          </p>
        </div>
      </div>
    );
  };

  // Renderizar score de confiança
  const renderConfidenceBar = (label: string, value: number) => (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600 w-24">{label}</span>
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div 
          className={`h-2 rounded-full ${
            value >= 80 ? 'bg-green-500' :
            value >= 60 ? 'bg-yellow-500' :
            'bg-red-500'
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs font-bold w-8">{value}%</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                🤖 Análise Inteligente da Vaga
              </h2>
              <p className="text-purple-100 mt-1">{vaga.titulo}</p>
            </div>
            <button 
              onClick={onClose} 
              className="text-white hover:text-gray-200 text-3xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
              <p className="mt-4 text-gray-600">Analisando vaga com IA...</p>
              <p className="text-sm text-gray-400">Isso pode levar alguns segundos</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800">❌ {error}</p>
            </div>
          )}

          {!loading && analiseAtual && (
            <>
              {/* Score Geral */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">Qualidade do Anúncio</h3>
                  <div className={`text-3xl font-bold ${
                    analiseAtual.confidence_score >= 80 ? 'text-green-600' :
                    analiseAtual.confidence_score >= 60 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {analiseAtual.confidence_score}/100
                  </div>
                </div>
                
                <div className="space-y-2">
                  {analiseAtual.confidence_detalhado && (
                    <>
                      {renderConfidenceBar('Clareza', analiseAtual.confidence_detalhado.clareza)}
                      {renderConfidenceBar('Atratividade', analiseAtual.confidence_detalhado.atratividade)}
                      {renderConfidenceBar('Completude', analiseAtual.confidence_detalhado.completude)}
                      {renderConfidenceBar('SEO', analiseAtual.confidence_detalhado.seo)}
                    </>
                  )}
                </div>
              </div>

              {/* Sugestões */}
              {analiseAtual.sugestoes && Object.keys(analiseAtual.sugestoes).filter(k => 
                analiseAtual.sugestoes[k as keyof typeof analiseAtual.sugestoes] && 
                typeof analiseAtual.sugestoes[k as keyof typeof analiseAtual.sugestoes] === 'object' &&
                'sugerido' in (analiseAtual.sugestoes[k as keyof typeof analiseAtual.sugestoes] as any)
              ).length > 0 ? (
                <div className="mb-6">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    💡 Sugestões de Melhoria
                    <span className="text-sm font-normal text-gray-500">
                      (clique para selecionar)
                    </span>
                  </h3>
                  <div className="grid gap-4">
                    {Object.entries(analiseAtual.sugestoes)
                      .filter(([_, v]) => v && typeof v === 'object' && 'sugerido' in v)
                      .map(([campo, sugestao]) => 
                        renderSugestaoCard(campo, sugestao as SugestaoIA)
                      )}
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center mb-6">
                  <span className="text-4xl">✅</span>
                  <p className="text-green-800 font-bold mt-2">Anúncio bem estruturado!</p>
                  <p className="text-green-600 text-sm">Nenhuma sugestão de melhoria identificada.</p>
                </div>
              )}

              {/* Keywords sugeridas */}
              {analiseAtual.sugestoes?.keywords && analiseAtual.sugestoes.keywords.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4 mb-6">
                  <h4 className="font-bold text-blue-800 mb-2">🔑 Keywords Sugeridas</h4>
                  <div className="flex flex-wrap gap-2">
                    {analiseAtual.sugestoes.keywords.map((kw, i) => (
                      <span key={i} className="bg-blue-200 text-blue-800 px-3 py-1 rounded-full text-sm">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Melhorias gerais */}
              {analiseAtual.sugestoes?.melhorias_gerais && analiseAtual.sugestoes.melhorias_gerais.length > 0 && (
                <div className="bg-purple-50 rounded-lg p-4 mb-6">
                  <h4 className="font-bold text-purple-800 mb-2">📝 Dicas Gerais</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-purple-700">
                    {analiseAtual.sugestoes.melhorias_gerais.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Modal de rejeição */}
              {showRejeicao && (
                <div className="bg-gray-100 rounded-lg p-4 mb-6">
                  <h4 className="font-bold text-gray-800 mb-2">Motivo da rejeição</h4>
                  <textarea
                    className="w-full border rounded-lg p-3 h-24"
                    placeholder="Explique por que está rejeitando as sugestões..."
                    value={motivoRejeicao}
                    onChange={e => setMotivoRejeicao(e.target.value)}
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => setShowRejeicao(false)}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleRejeitar}
                      disabled={!motivoRejeicao.trim()}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      Confirmar Rejeição
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && analiseAtual && (
          <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
            <div className="text-sm text-gray-500">
              Analisado por <strong>{analiseAtual.analisado_por}</strong> em{' '}
              {new Date(analiseAtual.analisado_em).toLocaleString('pt-BR')}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejeicao(true)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Rejeitar Sugestões
              </button>
              <button
                onClick={handleAplicar}
                disabled={temSugestoesSelecionaveis && sugestoesSelecionadas.length === 0}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {temSugestoesSelecionaveis 
                  ? `Aplicar ${sugestoesSelecionadas.length > 0 ? `(${sugestoesSelecionadas.length})` : ''} Sugestões`
                  : '✓ Concluir Análise'
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VagaSugestoesIA;
