/**
 * DistribuicaoIAPanel.tsx - Painel de Distribuição com Sugestão IA
 * 
 * Funcionalidades:
 * - Visualizar ranking de analistas gerado pela IA
 * - Aceitar sugestão ou escolher manualmente
 * - Justificativa obrigatória para override
 * - Histórico de decisões
 * - Métricas IA vs Manual
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import React, { useState, useEffect } from 'react';
import { useDistribuicaoIA, AnalistaScore, PESOS_SCORING } from '@/hooks/supabase/useDistribuicaoIA';
import { useDistribuicaoVagas } from '@/hooks/supabase/useDistribuicaoVagas';

interface DistribuicaoIAPanelProps {
  vagaId: number;
  vagaTitulo?: string;
  clienteNome?: string;
  onClose?: () => void;
  onDistribuicaoConfirmada?: () => void;
  currentUserId?: number;
}

const MOTIVOS_OVERRIDE = [
  { value: 'desenvolvimento_analista', label: '📚 Desenvolvimento do analista' },
  { value: 'relacionamento_cliente', label: '🤝 Relacionamento específico com cliente' },
  { value: 'balanceamento_carga', label: '⚖️ Balanceamento de carga da equipe' },
  { value: 'conhecimento_especifico', label: '🎯 Conhecimento específico necessário' },
  { value: 'indisponibilidade', label: '🚫 Analista sugerido indisponível' },
  { value: 'outro', label: '📝 Outro motivo' }
];

const DistribuicaoIAPanel: React.FC<DistribuicaoIAPanelProps> = ({
  vagaId,
  vagaTitulo,
  clienteNome,
  onClose,
  onDistribuicaoConfirmada,
  currentUserId
}) => {
  const {
    sugestaoAtual,
    loading: loadingIA,
    error: errorIA,
    gerarRankingAnalistas,
    registrarDecisao
  } = useDistribuicaoIA();

  const {
    adicionarAnalista,
    loading: loadingDist
  } = useDistribuicaoVagas();

  // Estados
  const [etapa, setEtapa] = useState<'ranking' | 'selecao' | 'confirmacao'>('ranking');
  const [analistasSelecionados, setAnalistasSelecionados] = useState<number[]>([]);
  const [motivoOverride, setMotivoOverride] = useState<string>('');
  const [justificativa, setJustificativa] = useState<string>('');
  const [showDetalhesScore, setShowDetalhesScore] = useState<number | null>(null);
  const [modoSelecao, setModoSelecao] = useState<'ia' | 'manual'>('ia');

  // Carregar ranking ao montar
  useEffect(() => {
    gerarRankingAnalistas(vagaId);
  }, [vagaId, gerarRankingAnalistas]);


  // Verificar se é override (seleção manual ou analistas diferentes dos sugeridos)
  const isOverride = () => {
    // Se o modo é manual, é sempre override
    if (modoSelecao === 'manual') return true;
    
    if (!sugestaoAtual || analistasSelecionados.length === 0) return false;
    
    const topSugeridos = sugestaoAtual.ranking_analistas
      .slice(0, analistasSelecionados.length)
      .map(a => a.analista_id);
    
    return !analistasSelecionados.every(id => topSugeridos.includes(id));
  };

  // Toggle seleção de analista — sem limite máximo (exibe todos os analistas cadastrados)
  const toggleAnalista = (analistaId: number) => {
    setAnalistasSelecionados(prev => {
      if (prev.includes(analistaId)) {
        return prev.filter(id => id !== analistaId);
      }
      return [...prev, analistaId];
    });
  };

  // Aceitar sugestão IA (top 2)
  const aceitarSugestaoIA = () => {
    if (sugestaoAtual && sugestaoAtual.ranking_analistas.length >= 2) {
      setModoSelecao('ia');
      setAnalistasSelecionados([
        sugestaoAtual.ranking_analistas[0].analista_id,
        sugestaoAtual.ranking_analistas[1].analista_id
      ]);
      setEtapa('confirmacao');
    }
  };

  // Confirmar distribuição
  const confirmarDistribuicao = async () => {
    // Validação: IA aceita = mínimo 2; Manual = mínimo 1
    const minimoAnalistas = modoSelecao === 'manual' ? 1 : 2;
    
    if (analistasSelecionados.length < minimoAnalistas) {
      alert(modoSelecao === 'manual' 
        ? 'Selecione pelo menos 1 analista' 
        : 'Para aceitar a sugestão da IA, selecione 2 analistas');
      return;
    }

    if (isOverride() && !motivoOverride) {
      alert('Selecione um motivo para a escolha diferente da IA');
      return;
    }

    if (isOverride() && motivoOverride === 'outro' && !justificativa) {
      alert('Descreva a justificativa');
      return;
    }

    try {
      // Registrar decisão no log
      const decisaoOk = await registrarDecisao({
        vaga_id: vagaId,
        analistas_sugeridos_ia: sugestaoAtual?.ranking_analistas.map(a => a.analista_id) || [],
        analistas_escolhidos: analistasSelecionados,
        tipo_decisao: isOverride() ? 'manual_override' : 'ia_aceita',
        justificativa: justificativa || undefined,
        motivo_override: motivoOverride || undefined,
        decidido_por: currentUserId || 0
      });

      if (!decisaoOk) {
        throw new Error('Falha ao registrar decisão no log');
      }

      // Adicionar analistas à vaga
      const errosAnalistas: string[] = [];
      const analistasJaAtribuidos: string[] = [];
      const analistasAdicionados: string[] = [];
      
      for (const analistaId of analistasSelecionados) {
        const resultado = await adicionarAnalista(vagaId, analistaId, {}, currentUserId);
        if (!resultado) {
          const analista = sugestaoAtual?.ranking_analistas.find(a => a.analista_id === analistaId);
          const nomeAnalista = analista?.nome || `ID ${analistaId}`;
          // Verificar se o erro é porque já está atribuído
          // (o hook retorna null mas não sabemos exatamente o motivo aqui)
          errosAnalistas.push(nomeAnalista);
        } else {
          const analista2 = sugestaoAtual?.ranking_analistas.find(a => a.analista_id === analistaId);
          analistasAdicionados.push(analista2?.nome || `ID ${analistaId}`);
        }
      }

      // Se alguns foram adicionados e outros deram erro
      if (analistasAdicionados.length > 0 && errosAnalistas.length > 0) {
        alert(`⚠️ Distribuição parcial:\n\n✅ Adicionados: ${analistasAdicionados.join(', ')}\n\n❌ Erro (já atribuídos?): ${errosAnalistas.join(', ')}`);
      } else if (errosAnalistas.length > 0 && analistasAdicionados.length === 0) {
        alert(`⚠️ Erro ao adicionar analistas: ${errosAnalistas.join(', ')}\n\nPossíveis causas:\n• Analista já está atribuído a esta vaga\n• Problema de permissão no banco`);
        return;
      }

      alert('✅ Distribuição configurada com sucesso!');
      onDistribuicaoConfirmada?.();
      onClose?.();
    } catch (err: any) {
      console.error('Erro ao confirmar distribuição:', err);
      alert(`❌ Erro ao configurar distribuição:\n${err.message || 'Erro desconhecido'}`);
    }
  };

  // Renderizar barra de score
  const renderScoreBar = (score: number, max: number, cor: string) => (
    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
      <div 
        className={`h-full ${cor}`}
        style={{ width: `${(score / max) * 100}%` }}
      />
    </div>
  );

  // Loading
  if (loadingIA && !sugestaoAtual) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
          <p className="text-gray-600">🤖 Analisando perfis dos analistas...</p>
          <p className="text-sm text-gray-400 mt-2">Calculando scores de compatibilidade</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden max-w-4xl">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              🤖 Distribuição Inteligente com IA
            </h2>
            <p className="text-purple-100 text-sm mt-1">
              {vagaTitulo} {clienteNome && `• ${clienteNome}`}
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">
              &times;
            </button>
          )}
        </div>

        {/* Etapas */}
        <div className="flex gap-4 mt-6">
          {['ranking', 'selecao', 'confirmacao'].map((e, i) => (
            <div key={e} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                etapa === e ? 'bg-white text-purple-600' :
                ['ranking', 'selecao', 'confirmacao'].indexOf(etapa) > i 
                  ? 'bg-white/40 text-white' : 'bg-white/20 text-white/50'
              }`}>
                {i + 1}
              </div>
              {i < 2 && <div className="w-8 h-0.5 bg-white/30 mx-1" />}
            </div>
          ))}
        </div>
      </div>

      {/* Erro */}
      {errorIA && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {errorIA}
        </div>
      )}

      {/* Conteúdo */}
      <div className="p-6">
        
        {/* Etapa 1: Ranking IA */}
        {etapa === 'ranking' && sugestaoAtual && (
          <div className="space-y-6">
            {/* Verificar se há analistas disponíveis */}
            {sugestaoAtual.ranking_analistas.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <div className="text-4xl mb-3">✅</div>
                <h3 className="font-bold text-yellow-800 mb-2">Todos os analistas já estão atribuídos</h3>
                <p className="text-sm text-yellow-600">
                  Esta vaga já possui analistas configurados. Não há novos analistas disponíveis para adicionar.
                </p>
                <button
                  onClick={onClose}
                  className="mt-4 px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <>
            {/* Info Box */}
            <div className="bg-purple-50 rounded-lg p-4 flex items-start gap-3">
              <div className="text-2xl">🤖</div>
              <div>
                <h3 className="font-bold text-purple-800">Sugestão da IA</h3>
                <p className="text-sm text-purple-600 mt-1">
                  Com base no histórico de performance, especialização e carga atual,
                  recomendamos os analistas abaixo para esta vaga.
                </p>
              </div>
            </div>

            {/* Ranking */}
            <div className="space-y-3">
              {sugestaoAtual.ranking_analistas.map((analista, index) => (
                <div 
                  key={analista.analista_id}
                  className={`border rounded-lg p-4 transition-all ${
                    index < 2 
                      ? 'border-purple-300 bg-purple-50' 
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    {/* Info */}
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                        index === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500' :
                        index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                        'bg-gray-400'
                      }`}>
                        {index + 1}º
                      </div>
                      <div>
                        <div className="font-bold text-gray-800 flex items-center gap-2">
                          {analista.nome}
                          {index < 2 && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                              ⭐ Recomendado
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {analista.justificativa}
                        </div>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-right">
                      <div className="text-2xl font-bold text-purple-600">
                        {analista.score_total}
                      </div>
                      <div className="text-xs text-gray-500">pontos</div>
                      <button
                        onClick={() => setShowDetalhesScore(
                          showDetalhesScore === analista.analista_id ? null : analista.analista_id
                        )}
                        className="text-xs text-purple-600 hover:underline mt-1"
                      >
                        {showDetalhesScore === analista.analista_id ? 'Ocultar' : 'Ver detalhes'}
                      </button>
                    </div>
                  </div>

                  {/* Detalhes do Score */}
                  {showDetalhesScore === analista.analista_id && (
                    <div className="mt-4 pt-4 border-t grid grid-cols-5 gap-3 text-xs">
                      <div>
                        <div className="text-gray-500 mb-1">Especialização</div>
                        {renderScoreBar(analista.scores.especializacao, 30, 'bg-blue-500')}
                        <div className="text-right text-gray-700 mt-1">
                          {analista.scores.especializacao}/30
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1">Cliente</div>
                        {renderScoreBar(analista.scores.cliente, 25, 'bg-green-500')}
                        <div className="text-right text-gray-700 mt-1">
                          {analista.scores.cliente}/25
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1">Carga</div>
                        {renderScoreBar(analista.scores.carga, 20, 'bg-yellow-500')}
                        <div className="text-right text-gray-700 mt-1">
                          {analista.scores.carga}/20
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1">Taxa Aprov.</div>
                        {renderScoreBar(analista.scores.taxa_aprovacao, 15, 'bg-purple-500')}
                        <div className="text-right text-gray-700 mt-1">
                          {analista.scores.taxa_aprovacao}/15
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1">Velocidade</div>
                        {renderScoreBar(analista.scores.velocidade, 10, 'bg-pink-500')}
                        <div className="text-right text-gray-700 mt-1">
                          {analista.scores.velocidade}/10
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Ações */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={aceitarSugestaoIA}
                className="flex-1 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
              >
                ✅ Aceitar Sugestão IA (Top 2)
              </button>
              <button
                onClick={() => {
                  setModoSelecao('manual');
                  setEtapa('selecao');
                }}
                className="flex-1 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                ✏️ Escolher Manualmente
              </button>
            </div>
              </>
            )}
          </div>
        )}

        {/* Etapa 2: Seleção Manual */}
        {etapa === 'selecao' && sugestaoAtual && (
          <div className="space-y-6">
            <div className="bg-yellow-50 rounded-lg p-4 flex items-start gap-3">
              <div className="text-2xl">✏️</div>
              <div>
                <h3 className="font-bold text-yellow-800">Seleção Manual</h3>
                <p className="text-sm text-yellow-600 mt-1">
                  Selecione quantos analistas desejar para conduzir esta vaga. 
                  {isOverride() && (
                    <span className="text-yellow-700 font-medium">
                      {' '}Sua escolha difere da sugestão da IA - será necessário justificar.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Lista de seleção */}
            <div className="space-y-2">
              {sugestaoAtual.ranking_analistas.map((analista, index) => (
                <div 
                  key={analista.analista_id}
                  onClick={() => toggleAnalista(analista.analista_id)}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    analistasSelecionados.includes(analista.analista_id)
                      ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                      : 'border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                        analistasSelecionados.includes(analista.analista_id)
                          ? 'border-purple-500 bg-purple-500 text-white'
                          : 'border-gray-300'
                      }`}>
                        {analistasSelecionados.includes(analista.analista_id) && '✓'}
                      </div>
                      <div>
                        <div className="font-medium text-gray-800">
                          {analista.nome}
                          {index < 2 && (
                            <span className="ml-2 text-xs text-purple-600">
                              (Sugerido pela IA)
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          Score: {analista.score_total} • Carga atual: {analista.carga_atual} vagas
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Selecionados */}
            {analistasSelecionados.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-2">
                  Selecionados ({analistasSelecionados.length}):
                </div>
                <div className="flex gap-2 flex-wrap">
                  {analistasSelecionados.map(id => {
                    const analista = sugestaoAtual.ranking_analistas.find(a => a.analista_id === id);
                    return analista && (
                      <span 
                        key={id}
                        className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm"
                      >
                        {analista.nome}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={() => setEtapa('ranking')}
                className="px-6 py-3 border rounded-lg hover:bg-gray-50"
              >
                ← Voltar
              </button>
              <button
                onClick={() => analistasSelecionados.length >= 1 && setEtapa('confirmacao')}
                disabled={analistasSelecionados.length < 1}
                className="flex-1 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* Etapa 3: Confirmação */}
        {etapa === 'confirmacao' && sugestaoAtual && (
          <div className="space-y-6">
            {/* Resumo */}
            <div className={`rounded-lg p-4 ${
              isOverride() ? 'bg-yellow-50' : 'bg-green-50'
            }`}>
              <h3 className={`font-bold ${isOverride() ? 'text-yellow-800' : 'text-green-800'}`}>
                {isOverride() ? '⚠️ Escolha Manual' : '✅ Sugestão IA Aceita'}
              </h3>
              <p className={`text-sm mt-1 ${isOverride() ? 'text-yellow-600' : 'text-green-600'}`}>
                {isOverride() 
                  ? 'Você escolheu analistas diferentes da sugestão da IA. Por favor, justifique.'
                  : 'Você aceitou a sugestão da IA. Os analistas serão configurados automaticamente.'
                }
              </p>
            </div>

            {/* Analistas escolhidos */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-3">Analistas que irão conduzir a vaga:</div>
              <div className="space-y-2">
                {analistasSelecionados.map((id, index) => {
                  const analista = sugestaoAtual.ranking_analistas.find(a => a.analista_id === id);
                  const posicaoOriginal = sugestaoAtual.ranking_analistas.findIndex(a => a.analista_id === id) + 1;
                  return analista && (
                    <div key={id} className="flex items-center justify-between p-3 bg-white rounded border">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium">{analista.nome}</div>
                          <div className="text-xs text-gray-500">
                            {posicaoOriginal}º no ranking IA • Score: {analista.score_total}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Justificativa (se override) */}
            {isOverride() && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Motivo da escolha diferente *
                  </label>
                  <select
                    value={motivoOverride}
                    onChange={e => setMotivoOverride(e.target.value)}
                    className="w-full border rounded-lg p-3"
                    required
                  >
                    <option value="">Selecione um motivo...</option>
                    {MOTIVOS_OVERRIDE.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                {motivoOverride === 'outro' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descreva a justificativa *
                    </label>
                    <textarea
                      value={justificativa}
                      onChange={e => setJustificativa(e.target.value)}
                      className="w-full border rounded-lg p-3 h-24"
                      placeholder="Explique por que escolheu diferente da sugestão da IA..."
                      required
                    />
                  </div>
                )}

                <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                  💡 Esta informação será usada para melhorar as sugestões futuras da IA 
                  e para comparar resultados entre decisões manuais e automáticas.
                </div>
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={() => setEtapa('selecao')}
                className="px-6 py-3 border rounded-lg hover:bg-gray-50"
              >
                ← Voltar
              </button>
              <button
                onClick={confirmarDistribuicao}
                disabled={loadingDist || (isOverride() && !motivoOverride)}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                {loadingDist ? 'Configurando...' : '✓ Confirmar Distribuição'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DistribuicaoIAPanel;

