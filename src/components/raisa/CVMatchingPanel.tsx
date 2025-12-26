/**
 * CVMatchingPanel.tsx - Painel de Resultados de Busca de CVs
 * 
 * Exibe candidatos aderentes à vaga com scores e ações
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import React, { useState, useEffect } from 'react';
import { Vaga } from '@/types';
import { useRaisaCVSearch, CandidatoMatch } from '../../hooks/Supabase/useRaisaCVSearch';

interface CVMatchingPanelProps {
  vaga: Vaga;
  onClose: () => void;
  onCandidaturaCriada?: (candidaturaId: number) => void;
  currentUserId: number;
}

const CVMatchingPanel: React.FC<CVMatchingPanelProps> = ({
  vaga,
  onClose,
  onCandidaturaCriada,
  currentUserId
}) => {
  const {
    matches,
    loading,
    error,
    buscarParaVaga,
    salvarMatchesVaga,
    atualizarStatusMatch,
    criarCandidaturaDoMatch,
    carregarMatchesVaga
  } = useRaisaCVSearch();

  const [buscaRealizada, setBuscaRealizada] = useState(false);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [criandoCandidatura, setCriandoCandidatura] = useState<number | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroScoreMin, setFiltroScoreMin] = useState<number>(0);

  // Carregar matches existentes ou buscar novos
  useEffect(() => {
    const carregar = async () => {
      // Primeiro, tentar carregar matches salvos
      const matchesSalvos = await carregarMatchesVaga(parseInt(vaga.id));
      
      if (matchesSalvos.length === 0) {
        // Se não há matches salvos, realizar busca
        await buscarParaVaga(vaga);
        setBuscaRealizada(true);
      } else {
        setBuscaRealizada(true);
      }
    };

    carregar();
  }, [vaga.id]);

  // Filtrar matches
  const matchesFiltrados = matches.filter(m => {
    if (filtroStatus !== 'todos' && m.status !== filtroStatus) return false;
    if (m.score_total < filtroScoreMin) return false;
    return true;
  });

  // Realizar nova busca
  const handleNovaBusca = async () => {
    setBuscaRealizada(false);
    await buscarParaVaga(vaga);
    setBuscaRealizada(true);
  };

  // Salvar matches encontrados
  const handleSalvarMatches = async () => {
    const sucesso = await salvarMatchesVaga(parseInt(vaga.id), matches);
    if (sucesso) {
      alert('✅ Matches salvos com sucesso!');
    }
  };

  // Selecionar/Desselecionar candidato
  const toggleSelecionado = (pessoaId: number) => {
    setSelecionados(prev => 
      prev.includes(pessoaId)
        ? prev.filter(id => id !== pessoaId)
        : [...prev, pessoaId]
    );
  };

  // Criar candidatura para um match
  const handleCriarCandidatura = async (pessoaId: number) => {
    setCriandoCandidatura(pessoaId);
    try {
      const candidaturaId = await criarCandidaturaDoMatch(
        parseInt(vaga.id),
        pessoaId,
        currentUserId
      );

      if (candidaturaId && onCandidaturaCriada) {
        onCandidaturaCriada(candidaturaId);
      }
    } finally {
      setCriandoCandidatura(null);
    }
  };

  // Criar candidaturas para todos selecionados
  const handleCriarCandidaturasSelecionados = async () => {
    if (selecionados.length === 0) {
      alert('Selecione pelo menos um candidato');
      return;
    }

    const confirmacao = confirm(
      `Criar ${selecionados.length} candidatura(s) para esta vaga?`
    );

    if (!confirmacao) return;

    for (const pessoaId of selecionados) {
      await handleCriarCandidatura(pessoaId);
    }

    setSelecionados([]);
    alert(`✅ ${selecionados.length} candidatura(s) criada(s)!`);
  };

  // Descartar match
  const handleDescartar = async (pessoaId: number) => {
    const motivo = prompt('Motivo do descarte (opcional):');
    await atualizarStatusMatch(
      parseInt(vaga.id),
      pessoaId,
      'descartado',
      currentUserId,
      motivo || undefined
    );
  };

  // Cor do score
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    if (score >= 40) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  // Cor do status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'novo':
        return 'bg-blue-100 text-blue-800';
      case 'visualizado':
        return 'bg-gray-100 text-gray-800';
      case 'selecionado':
        return 'bg-green-100 text-green-800';
      case 'descartado':
        return 'bg-red-100 text-red-800';
      case 'candidatura_criada':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                🔍 Busca Inteligente de CVs
              </h2>
              <p className="text-blue-100 mt-1">
                Vaga: {vaga.titulo} | {vaga.senioridade}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {(Array.isArray(vaga.stack_tecnologica) 
                  ? vaga.stack_tecnologica 
                  : (vaga.stack_tecnologica || '').split(',').map(s => s.trim())
                ).filter(Boolean).map((skill, i) => (
                  <span key={i} className="bg-blue-500 bg-opacity-50 px-2 py-1 rounded text-xs">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
            <button 
              onClick={onClose}
              className="text-white hover:text-gray-200 text-3xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-gray-50 border-b px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleNovaBusca}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '⏳' : '🔄'} Nova Busca
            </button>
            
            <button
              onClick={handleSalvarMatches}
              disabled={loading || matches.length === 0}
              className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              💾 Salvar Matches
            </button>
          </div>

          <div className="flex items-center gap-4">
            <select
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="todos">Todos os status</option>
              <option value="novo">Novos</option>
              <option value="visualizado">Visualizados</option>
              <option value="selecionado">Selecionados</option>
              <option value="descartado">Descartados</option>
              <option value="candidatura_criada">Com Candidatura</option>
            </select>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Score mín:</label>
              <input
                type="number"
                value={filtroScoreMin}
                onChange={e => setFiltroScoreMin(parseInt(e.target.value) || 0)}
                min={0}
                max={100}
                className="border rounded px-2 py-1 w-16 text-center"
              />
            </div>
          </div>
        </div>

        {/* Seleção em massa */}
        {selecionados.length > 0 && (
          <div className="bg-indigo-50 border-b border-indigo-200 px-6 py-3 flex items-center justify-between">
            <span className="text-indigo-800 font-medium">
              {selecionados.length} candidato(s) selecionado(s)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelecionados([])}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Limpar seleção
              </button>
              <button
                onClick={handleCriarCandidaturasSelecionados}
                className="bg-indigo-600 text-white px-4 py-1 rounded text-sm hover:bg-indigo-700"
              >
                Criar Candidaturas
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && !buscaRealizada && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Buscando candidatos aderentes...</p>
              <p className="text-sm text-gray-400">Analisando banco de talentos</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800">❌ {error}</p>
            </div>
          )}

          {buscaRealizada && matchesFiltrados.length === 0 && (
            <div className="text-center py-12">
              <span className="text-6xl">🔍</span>
              <p className="mt-4 text-gray-600 text-lg">Nenhum candidato encontrado</p>
              <p className="text-sm text-gray-400">
                Tente ajustar os filtros ou adicionar mais pessoas ao banco de talentos
              </p>
            </div>
          )}

          {matchesFiltrados.length > 0 && (
            <div className="space-y-4">
              {matchesFiltrados.map((match, index) => (
                <div
                  key={match.pessoa_id}
                  className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
                    selecionados.includes(match.pessoa_id) ? 'ring-2 ring-indigo-500 bg-indigo-50' : 'bg-white'
                  } ${match.status === 'descartado' ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox de seleção */}
                    <div className="pt-1">
                      <input
                        type="checkbox"
                        checked={selecionados.includes(match.pessoa_id)}
                        onChange={() => toggleSelecionado(match.pessoa_id)}
                        disabled={match.status === 'candidatura_criada' || match.status === 'descartado'}
                        className="w-5 h-5 text-indigo-600 rounded"
                      />
                    </div>

                    {/* Ranking */}
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${
                        index === 0 ? 'text-yellow-500' :
                        index === 1 ? 'text-gray-400' :
                        index === 2 ? 'text-orange-400' :
                        'text-gray-600'
                      }`}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-center min-w-[80px]">
                      <div className={`text-3xl font-bold px-3 py-1 rounded ${getScoreColor(match.score_total)}`}>
                        {match.score_total}%
                      </div>
                      <span className="text-xs text-gray-500">Score</span>
                    </div>

                    {/* Info Principal */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900 text-lg">{match.nome}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs uppercase ${getStatusBadge(match.status)}`}>
                          {match.status.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-2">
                        {match.titulo_profissional} | {match.senioridade}
                      </p>

                      <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-3">
                        <span>📧 {match.email}</span>
                        {match.telefone && <span>📱 {match.telefone}</span>}
                        <span>📅 {match.disponibilidade}</span>
                        <span>🏠 {match.modalidade_preferida}</span>
                        {match.pretensao_salarial > 0 && (
                          <span>💰 R$ {match.pretensao_salarial.toLocaleString('pt-BR')}</span>
                        )}
                      </div>

                      {/* Skills Match */}
                      <div className="space-y-2">
                        {match.skills_match.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-green-700 font-medium">✅ Match:</span>
                            {match.skills_match.map((skill, i) => (
                              <span key={i} className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs">
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {match.skills_faltantes.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-red-700 font-medium">⚠️ Faltam:</span>
                            {match.skills_faltantes.map((skill, i) => (
                              <span key={i} className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs">
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex flex-col gap-2">
                      {match.status !== 'candidatura_criada' && match.status !== 'descartado' && (
                        <>
                          <button
                            onClick={() => handleCriarCandidatura(match.pessoa_id)}
                            disabled={criandoCandidatura === match.pessoa_id}
                            className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            {criandoCandidatura === match.pessoa_id ? '⏳' : '➕'} Candidatura
                          </button>
                          <button
                            onClick={() => handleDescartar(match.pessoa_id)}
                            className="border border-red-300 text-red-600 px-3 py-1.5 rounded text-sm hover:bg-red-50"
                          >
                            ❌ Descartar
                          </button>
                        </>
                      )}
                      
                      {match.status === 'candidatura_criada' && (
                        <span className="text-purple-600 text-sm font-medium">
                          ✓ Candidatura criada
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {matchesFiltrados.length} candidato(s) encontrado(s)
            {matches.length !== matchesFiltrados.length && (
              <span className="text-gray-400"> ({matches.length} total)</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default CVMatchingPanel;
