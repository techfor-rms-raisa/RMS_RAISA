/**
 * DistribuicaoVagasPanel.tsx - Painel de Distribuição Inteligente
 * 
 * Funcionalidades:
 * - Configurar analistas responsáveis pela vaga
 * - Visualizar distribuição atual
 * - Redistribuir candidatos manualmente
 * - Ver histórico de distribuição
 * - Estatísticas de balanceamento
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import React, { useState, useEffect } from 'react';
import { useDistribuicaoVagas, AnalistaDistribuicao } from '@/hooks/supabase/useDistribuicaoVagas';

interface DistribuicaoVagasPanelProps {
  vagaId: number;
  vagaTitulo?: string;
  clienteNome?: string;
  onClose?: () => void;
  currentUserId?: number;
}

const DistribuicaoVagasPanel: React.FC<DistribuicaoVagasPanelProps> = ({
  vagaId,
  vagaTitulo,
  clienteNome,
  onClose,
  currentUserId
}) => {
  const {
    distribuicaoAtual,
    historico,
    loading,
    error,
    carregarDistribuicaoVaga,
    adicionarAnalista,
    removerAnalista,
    atualizarConfigAnalista,
    carregarHistorico,
    listarAnalistasDisponiveis
  } = useDistribuicaoVagas();

  // Estados locais
  const [analistasDisponiveis, setAnalistasDisponiveis] = useState<{id: number, nome: string, email: string}[]>([]);
  const [analistaSelecionado, setAnalistaSelecionado] = useState<number | null>(null);
  const [showAddAnalista, setShowAddAnalista] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [configEditando, setConfigEditando] = useState<number | null>(null);

  // Carregar dados iniciais
  useEffect(() => {
    carregarDistribuicaoVaga(vagaId);
    carregarHistorico({ vagaId, limite: 20 });
    loadAnalistas();
  }, [vagaId]);

  const loadAnalistas = async () => {
    const analistas = await listarAnalistasDisponiveis();
    setAnalistasDisponiveis(analistas);
  };

  // Adicionar analista
  const handleAddAnalista = async () => {
    if (!analistaSelecionado) return;
    
    await adicionarAnalista(vagaId, analistaSelecionado, {}, currentUserId);
    setAnalistaSelecionado(null);
    setShowAddAnalista(false);
  };

  // Remover analista
  const handleRemoveAnalista = async (analistaId: number) => {
    if (!confirm('Remover este analista? Os candidatos serão redistribuídos automaticamente.')) return;
    await removerAnalista(vagaId, analistaId, true);
  };

  // Toggle ativo
  const handleToggleAtivo = async (distribuicaoId: number, ativoAtual: boolean) => {
    await atualizarConfigAnalista(distribuicaoId, { ativo: !ativoAtual });
    carregarDistribuicaoVaga(vagaId);
  };

  // Calcular cor baseada na carga
  const getLoadColor = (atribuidos: number, max: number | null) => {
    if (max === null) return 'bg-blue-100 text-blue-700';
    const percentual = (atribuidos / max) * 100;
    if (percentual >= 90) return 'bg-red-100 text-red-700';
    if (percentual >= 70) return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  };

  // Analistas que ainda não estão na vaga
  const analistasNaoAtribuidos = analistasDisponiveis.filter(
    a => !distribuicaoAtual?.analistas.some(da => da.analista_id === a.id)
  );

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              👥 Distribuição Inteligente
            </h2>
            <p className="text-indigo-100 text-sm mt-1">
              {vagaTitulo || distribuicaoAtual?.vaga_titulo}
              {clienteNome && ` • ${clienteNome}`}
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">
              &times;
            </button>
          )}
        </div>

        {/* Stats rápidas */}
        <div className="flex gap-6 mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold">
              {distribuicaoAtual?.analistas.filter(a => a.ativo).length || 0}
            </div>
            <div className="text-xs text-indigo-200">Analistas Ativos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {distribuicaoAtual?.total_candidatos || 0}
            </div>
            <div className="text-xs text-indigo-200">Total Candidatos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {distribuicaoAtual?.analistas.reduce((sum, a) => sum + a.candidatos_atribuidos, 0) || 0}
            </div>
            <div className="text-xs text-indigo-200">Distribuídos</div>
          </div>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Conteúdo */}
      <div className="p-6">
        {/* Tabs */}
        <div className="flex gap-4 border-b mb-6">
          <button
            onClick={() => setShowHistorico(false)}
            className={`pb-2 px-1 font-medium ${!showHistorico 
              ? 'border-b-2 border-indigo-600 text-indigo-600' 
              : 'text-gray-500'}`}
          >
            👥 Analistas
          </button>
          <button
            onClick={() => setShowHistorico(true)}
            className={`pb-2 px-1 font-medium ${showHistorico 
              ? 'border-b-2 border-indigo-600 text-indigo-600' 
              : 'text-gray-500'}`}
          >
            📋 Histórico
          </button>
        </div>

        {/* Tab: Analistas */}
        {!showHistorico && (
          <div className="space-y-4">
            {/* Botão adicionar */}
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Analistas Responsáveis</h3>
              <button
                onClick={() => setShowAddAnalista(!showAddAnalista)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm"
              >
                + Adicionar Analista
              </button>
            </div>

            {/* Form adicionar */}
            {showAddAnalista && (
              <div className="bg-indigo-50 rounded-lg p-4 flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Selecione o Analista
                  </label>
                  <select
                    value={analistaSelecionado || ''}
                    onChange={e => setAnalistaSelecionado(Number(e.target.value) || null)}
                    className="w-full border rounded-lg p-2"
                  >
                    <option value="">Escolha um analista...</option>
                    {analistasNaoAtribuidos.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.nome} ({a.email})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleAddAnalista}
                  disabled={!analistaSelecionado || loading}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => { setShowAddAnalista(false); setAnalistaSelecionado(null); }}
                  className="text-gray-500 hover:text-gray-700 px-3 py-2"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Lista de analistas */}
            {loading && !distribuicaoAtual ? (
              <div className="text-center py-8 text-gray-400">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="mt-2">Carregando...</p>
              </div>
            ) : distribuicaoAtual?.analistas.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <div className="text-4xl mb-3">👥</div>
                <p className="text-gray-500 font-medium">Nenhum analista configurado</p>
                <p className="text-gray-400 text-sm mt-1">
                  Adicione analistas para ativar a distribuição automática
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {distribuicaoAtual?.analistas.map((analista, index) => (
                  <div
                    key={analista.id}
                    className={`border rounded-lg p-4 ${!analista.ativo ? 'opacity-60 bg-gray-50' : 'bg-white'}`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Info do analista */}
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                          {analista.analista_nome?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {analista.analista_nome}
                            {!analista.ativo && (
                              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                                Pausado
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">{analista.analista_email}</div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-6">
                        {/* Ordem */}
                        <div className="text-center">
                          <div className="text-xs text-gray-400">Ordem</div>
                          <div className="font-bold text-gray-700">#{analista.ordem_alternancia}</div>
                        </div>

                        {/* Candidatos */}
                        <div className="text-center">
                          <div className="text-xs text-gray-400">Candidatos</div>
                          <div className={`font-bold px-3 py-1 rounded ${getLoadColor(analista.candidatos_atribuidos, analista.max_candidatos)}`}>
                            {analista.candidatos_atribuidos}
                            {analista.max_candidatos && ` / ${analista.max_candidatos}`}
                          </div>
                        </div>

                        {/* Percentual */}
                        <div className="text-center">
                          <div className="text-xs text-gray-400">Peso</div>
                          <div className="font-bold text-gray-700">{analista.percentual_distribuicao}%</div>
                        </div>

                        {/* Ações */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleToggleAtivo(analista.id, analista.ativo)}
                            className={`p-2 rounded ${analista.ativo 
                              ? 'text-yellow-600 hover:bg-yellow-50' 
                              : 'text-green-600 hover:bg-green-50'}`}
                            title={analista.ativo ? 'Pausar' : 'Ativar'}
                          >
                            {analista.ativo ? '⏸️' : '▶️'}
                          </button>
                          <button
                            onClick={() => handleRemoveAnalista(analista.analista_id)}
                            className="p-2 rounded text-red-600 hover:bg-red-50"
                            title="Remover"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Barra de progresso visual */}
                    {analista.max_candidatos && (
                      <div className="mt-3">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all ${
                              (analista.candidatos_atribuidos / analista.max_candidatos) >= 0.9 
                                ? 'bg-red-500' 
                                : (analista.candidatos_atribuidos / analista.max_candidatos) >= 0.7
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(100, (analista.candidatos_atribuidos / analista.max_candidatos) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Info de alternância */}
            {distribuicaoAtual && distribuicaoAtual.analistas.length >= 2 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                <h4 className="font-medium text-blue-800 flex items-center gap-2">
                  🔄 Distribuição Round-Robin Ativa
                </h4>
                <p className="text-sm text-blue-600 mt-1">
                  Os novos candidatos serão distribuídos automaticamente entre os analistas ativos,
                  priorizando quem tem menos candidatos atribuídos.
                </p>
                <div className="mt-3 text-sm">
                  <strong>Ordem atual:</strong>{' '}
                  {distribuicaoAtual.analistas
                    .filter(a => a.ativo)
                    .sort((a, b) => a.candidatos_atribuidos - b.candidatos_atribuidos)
                    .map(a => a.analista_nome?.split(' ')[0])
                    .join(' → ')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Histórico */}
        {showHistorico && (
          <div className="space-y-4">
            <h3 className="font-bold text-gray-800">Histórico de Distribuição</h3>
            
            {historico.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                Nenhum histórico de distribuição
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {historico.map(h => (
                  <div 
                    key={h.id}
                    className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                  >
                    {/* Ícone por tipo */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      h.tipo_atribuicao === 'automatica' 
                        ? 'bg-green-100 text-green-600'
                        : h.tipo_atribuicao === 'redistribuicao'
                          ? 'bg-yellow-100 text-yellow-600'
                          : 'bg-blue-100 text-blue-600'
                    }`}>
                      {h.tipo_atribuicao === 'automatica' ? '🤖' : 
                       h.tipo_atribuicao === 'redistribuicao' ? '🔄' : '👤'}
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <div className="text-sm">
                        <span className="font-medium">Candidatura #{h.candidatura_id}</span>
                        {' → '}
                        <span className="text-indigo-600 font-medium">{h.analista_nome}</span>
                      </div>
                      {h.tipo_atribuicao === 'redistribuicao' && h.analista_anterior_nome && (
                        <div className="text-xs text-gray-500">
                          Redistribuído de: {h.analista_anterior_nome}
                          {h.motivo_redistribuicao && ` • ${h.motivo_redistribuicao}`}
                        </div>
                      )}
                    </div>

                    {/* Data */}
                    <div className="text-xs text-gray-400">
                      {new Date(h.atribuido_em).toLocaleString('pt-BR')}
                    </div>

                    {/* Badge tipo */}
                    <span className={`text-xs px-2 py-1 rounded ${
                      h.tipo_atribuicao === 'automatica' 
                        ? 'bg-green-100 text-green-700'
                        : h.tipo_atribuicao === 'redistribuicao'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}>
                      {h.tipo_atribuicao === 'automatica' ? 'Automático' : 
                       h.tipo_atribuicao === 'redistribuicao' ? 'Redistribuído' : 'Manual'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
        <p className="text-xs text-gray-500">
          💡 A distribuição automática é acionada quando um novo candidato é registrado
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  );
};

export default DistribuicaoVagasPanel;
