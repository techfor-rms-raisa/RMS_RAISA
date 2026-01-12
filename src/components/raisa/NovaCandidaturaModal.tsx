/**
 * NovaCandidaturaModal.tsx - Modal de Nova Candidatura
 * 
 * Modal simplificado para criar candidaturas a partir do:
 * - Banco de Talentos (busca de candidatos compatíveis)
 * - Sugestões IA
 * 
 * Versão: 2.0 - Simplificado (sem importação de CV)
 * Data: 12/01/2026
 */

import React, { useState, useEffect } from 'react';
import { 
  X, Search, Sparkles, 
  CheckCircle, Loader2,
  User, UserPlus, Users, Award, Building2
} from 'lucide-react';
import { Vaga } from '@/types';
import { useRaisaCVSearch, CandidatoMatch } from '@/hooks/supabase/useRaisaCVSearch';

// ============================================
// TIPOS
// ============================================

interface NovaCandidaturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  vagas: Vaga[];
  onCandidaturaCriada?: (candidaturaId: number) => void;
  currentUserId: number;
  vagaPreSelecionada?: Vaga;
}

type AbaAtiva = 'banco' | 'sugestoes';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const NovaCandidaturaModal: React.FC<NovaCandidaturaModalProps> = ({
  isOpen,
  onClose,
  vagas,
  onCandidaturaCriada,
  currentUserId,
  vagaPreSelecionada
}) => {
  // Estados do Modal
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('banco');
  const [vagaSelecionadaId, setVagaSelecionadaId] = useState<string>('');
  
  // Estados de Origem/Indicação
  const [candidatoSelecionado, setCandidatoSelecionado] = useState<CandidatoMatch | null>(null);
  const [mostrarFormIndicacao, setMostrarFormIndicacao] = useState(false);
  const [origem, setOrigem] = useState<'aquisicao' | 'indicacao_cliente'>('aquisicao');
  const [indicadoPorNome, setIndicadoPorNome] = useState('');
  const [indicadoPorCargo, setIndicadoPorCargo] = useState('');
  const [indicacaoObservacoes, setIndicacaoObservacoes] = useState('');

  // Hook de busca no Banco de Talentos
  const {
    matches,
    loading: loadingMatches,
    error: errorMatches,
    buscarParaVaga,
    criarCandidaturaDoMatch
  } = useRaisaCVSearch();

  // Estados para aba Banco de Talentos
  const [buscaBancoRealizada, setBuscaBancoRealizada] = useState(false);
  const [criandoCandidatura, setCriandoCandidatura] = useState<number | null>(null);
  const [filtroScoreMin, setFiltroScoreMin] = useState<number>(0);

  // Vaga selecionada (comparação como string para evitar problemas de tipo)
  const vagaSelecionada = vagas.find(v => String(v.id) === String(vagaSelecionadaId));

  // Pré-selecionar vaga se fornecida
  useEffect(() => {
    if (vagaPreSelecionada) {
      setVagaSelecionadaId(vagaPreSelecionada.id);
    }
  }, [vagaPreSelecionada]);

  // Reset ao abrir modal
  useEffect(() => {
    if (isOpen) {
      setBuscaBancoRealizada(false);
      setFiltroScoreMin(0);
      setCandidatoSelecionado(null);
      setMostrarFormIndicacao(false);
      setOrigem('aquisicao');
      setIndicadoPorNome('');
      setIndicadoPorCargo('');
      setIndicacaoObservacoes('');
    }
  }, [isOpen]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleFechar = () => {
    onClose();
  };

  const handleBuscarCandidatos = async () => {
    console.log('🔍 handleBuscarCandidatos chamado');
    console.log('vagaSelecionadaId:', vagaSelecionadaId);
    console.log('vagaSelecionada:', vagaSelecionada);
    
    if (vagaSelecionada) {
      console.log('✅ Vaga encontrada, iniciando busca...');
      console.log('Stack tecnológica:', vagaSelecionada.stack_tecnologica);
      setBuscaBancoRealizada(false);
      await buscarParaVaga(vagaSelecionada);
      setBuscaBancoRealizada(true);
      console.log('✅ Busca concluída, matches:', matches);
    } else {
      console.error('❌ Vaga não encontrada! vagaSelecionadaId:', vagaSelecionadaId);
      console.log('Vagas disponíveis:', vagas.map(v => ({ id: v.id, tipo: typeof v.id })));
    }
  };

  const handleSelecionarCandidato = (match: CandidatoMatch) => {
    setCandidatoSelecionado(match);
    setMostrarFormIndicacao(true);
  };

  const handleCriarCandidatura = async () => {
    if (!candidatoSelecionado || !vagaSelecionada) return;
    
    setCriandoCandidatura(candidatoSelecionado.pessoa_id);
    
    try {
      // Criar candidatura com dados de indicação
      const dadosIndicacao = origem === 'indicacao_cliente' ? {
        origem: 'indicacao_cliente' as const,
        indicado_por_nome: indicadoPorNome || undefined,
        indicado_por_cargo: indicadoPorCargo || undefined,
        indicacao_observacoes: indicacaoObservacoes || undefined
      } : {
        origem: 'aquisicao' as const
      };

      const candidatura = await criarCandidaturaDoMatch(
        candidatoSelecionado.pessoa_id,
        vagaSelecionada.id,
        currentUserId,
        dadosIndicacao
      );
      
      if (candidatura) {
        const tipoMsg = origem === 'indicacao_cliente' ? '📋 INDICAÇÃO' : '🔍 AQUISIÇÃO';
        alert(`✅ Candidatura criada com sucesso!\n${tipoMsg}\nCandidato: ${candidatoSelecionado.nome}\nVaga: ${vagaSelecionada.titulo}`);
        
        if (onCandidaturaCriada) {
          onCandidaturaCriada(parseInt(candidatura.id));
        }
        
        // Reset e fechar
        setCandidatoSelecionado(null);
        setMostrarFormIndicacao(false);
        handleFechar();
      }
    } catch (error: any) {
      alert(`❌ Erro ao criar candidatura: ${error.message}`);
    } finally {
      setCriandoCandidatura(null);
    }
  };

  const handleCancelarIndicacao = () => {
    setCandidatoSelecionado(null);
    setMostrarFormIndicacao(false);
    setOrigem('aquisicao');
    setIndicadoPorNome('');
    setIndicadoPorCargo('');
    setIndicacaoObservacoes('');
  };

  // ============================================
  // RENDER: NÃO ABERTO
  // ============================================

  if (!isOpen) return null;

  // ============================================
  // RENDER: MODAL
  // ============================================

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* ============================================ */}
        {/* HEADER */}
        {/* ============================================ */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <UserPlus className="w-7 h-7" />
                Nova Candidatura
              </h2>
              <p className="text-orange-100 text-sm mt-1">
                Selecione um candidato do banco de talentos para criar a candidatura
              </p>
            </div>
            <button 
              onClick={handleFechar}
              className="text-white hover:text-orange-200 text-3xl leading-none p-2"
            >
              <X className="w-8 h-8" />
            </button>
          </div>
        </div>

        {/* ============================================ */}
        {/* ABAS */}
        {/* ============================================ */}
        {!mostrarFormIndicacao && (
          <div className="bg-gray-100 p-4 flex gap-2">
            <button 
              onClick={() => setAbaAtiva('banco')}
              className={`px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
                abaAtiva === 'banco' 
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Search className="w-5 h-5" /> Banco de Talentos
            </button>
            <button 
              onClick={() => setAbaAtiva('sugestoes')}
              className={`px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
                abaAtiva === 'sugestoes' 
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Sparkles className="w-5 h-5" /> Sugestões IA
            </button>
          </div>
        )}

        {/* ============================================ */}
        {/* CONTEÚDO */}
        {/* ============================================ */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* FORMULÁRIO DE INDICAÇÃO (quando candidato selecionado) */}
          {mostrarFormIndicacao && candidatoSelecionado && (
            <div className="space-y-6">
              {/* Card do Candidato Selecionado */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                    {candidatoSelecionado.nome.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">{candidatoSelecionado.nome}</h3>
                    <p className="text-gray-600">{candidatoSelecionado.titulo_profissional} | {candidatoSelecionado.senioridade}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        candidatoSelecionado.score_total >= 80 ? 'bg-green-100 text-green-700' :
                        candidatoSelecionado.score_total >= 60 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        Score: {candidatoSelecionado.score_total}%
                      </span>
                      <span className="text-sm text-gray-500">
                        para {vagaSelecionada?.titulo}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ORIGEM DO CANDIDATO */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  🎯 Origem do Candidato
                </label>
                <div className="flex flex-wrap gap-3">
                  <label className={`flex items-center px-5 py-3 rounded-xl cursor-pointer transition-all ${
                    origem === 'aquisicao' 
                      ? 'bg-blue-100 border-2 border-blue-500 text-blue-700' 
                      : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="origem"
                      value="aquisicao"
                      checked={origem === 'aquisicao'}
                      onChange={() => setOrigem('aquisicao')}
                      className="sr-only"
                    />
                    <Search className="w-5 h-5 mr-2" />
                    <div>
                      <span className="font-medium">Aquisição Própria</span>
                      <p className="text-xs opacity-75">Candidato encontrado pelo analista</p>
                    </div>
                  </label>
                  <label className={`flex items-center px-5 py-3 rounded-xl cursor-pointer transition-all ${
                    origem === 'indicacao_cliente' 
                      ? 'bg-amber-100 border-2 border-amber-500 text-amber-700' 
                      : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="origem"
                      value="indicacao_cliente"
                      checked={origem === 'indicacao_cliente'}
                      onChange={() => setOrigem('indicacao_cliente')}
                      className="sr-only"
                    />
                    <Building2 className="w-5 h-5 mr-2" />
                    <div>
                      <span className="font-medium">Indicação do Cliente</span>
                      <p className="text-xs opacity-75">Candidato indicado pelo cliente</p>
                    </div>
                  </label>
                </div>

                {/* Campos de Indicação */}
                {origem === 'indicacao_cliente' && (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <h4 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Dados da Indicação
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Indicado por (nome)</label>
                        <input
                          type="text"
                          value={indicadoPorNome}
                          onChange={e => setIndicadoPorNome(e.target.value)}
                          placeholder="Nome de quem indicou"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Cargo de quem indicou</label>
                        <input
                          type="text"
                          value={indicadoPorCargo}
                          onChange={e => setIndicadoPorCargo(e.target.value)}
                          placeholder="Ex: Gerente de TI"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-gray-600 mb-1">Observações da indicação</label>
                      <textarea
                        value={indicacaoObservacoes}
                        onChange={e => setIndicacaoObservacoes(e.target.value)}
                        placeholder="Contexto da indicação, relacionamento com o candidato..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20 focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                      />
                    </div>
                    <div className="mt-3 p-2 bg-amber-100 rounded text-xs text-amber-700">
                      ⚠️ Candidatos indicados <strong>não contam</strong> na performance do analista e podem ter fluxo de aprovação diferenciado.
                    </div>
                  </div>
                )}
              </div>

              {/* Botões de Ação */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleCancelarIndicacao}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCriarCandidatura}
                  disabled={criandoCandidatura !== null}
                  className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:shadow-lg transition font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {criandoCandidatura ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Criar Candidatura
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* BUSCA NORMAL (quando não há candidato selecionado) */}
          {!mostrarFormIndicacao && (
            <>
              {/* Seleção de Vaga */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📁 Selecionar Vaga
                </label>
                <select 
                  value={vagaSelecionadaId}
                  onChange={e => {
                    setVagaSelecionadaId(e.target.value);
                    setBuscaBancoRealizada(false);
                  }}
                  className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                >
                  <option value="">Selecione uma vaga para buscar candidatos compatíveis...</option>
                  {vagas.filter(v => v.status === 'aberta').map(v => (
                    <option key={v.id} value={v.id}>
                      {v.titulo} - {v.senioridade} 
                      {v.stack_tecnologica && ` (${Array.isArray(v.stack_tecnologica) ? v.stack_tecnologica.slice(0, 3).join(', ') : v.stack_tecnologica})`}
                    </option>
                  ))}
                </select>
              </div>

              {/* ABA: BANCO DE TALENTOS */}
              {abaAtiva === 'banco' && (
                <div className="space-y-4">
                  {/* Se não tem vaga selecionada */}
                  {!vagaSelecionadaId && (
                    <div className="text-center py-12">
                      <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">Selecione uma Vaga</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Escolha uma vaga no dropdown acima para buscar candidatos compatíveis
                      </p>
                    </div>
                  )}

                  {/* Se tem vaga, mostrar busca */}
                  {vagaSelecionadaId && (
                    <>
                      {/* Toolbar de busca */}
                      <div className="flex items-center justify-between bg-gray-50 p-4 rounded-xl">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleBuscarCandidatos}
                            disabled={loadingMatches}
                            className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-5 py-2.5 rounded-xl hover:shadow-lg disabled:opacity-50 transition font-medium"
                          >
                            {loadingMatches ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Buscando...
                              </>
                            ) : (
                              <>
                                <Search className="w-5 h-5" />
                                Buscar Candidatos
                              </>
                            )}
                          </button>

                          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border">
                            <span className="text-sm text-gray-600">Score mín:</span>
                            <input
                              type="number"
                              value={filtroScoreMin}
                              onChange={e => setFiltroScoreMin(parseInt(e.target.value) || 0)}
                              min={0}
                              max={100}
                              className="border-none focus:ring-0 w-14 text-center text-sm font-medium"
                            />
                            <span className="text-gray-400">%</span>
                          </div>
                        </div>

                        {buscaBancoRealizada && (
                          <span className="text-sm text-gray-500 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            {matches.filter(m => m.score_total >= filtroScoreMin).length} candidato(s) encontrado(s)
                          </span>
                        )}
                      </div>

                      {/* Loading */}
                      {loadingMatches && !buscaBancoRealizada && (
                        <div className="text-center py-12">
                          <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
                          <p className="text-gray-600">Buscando candidatos compatíveis...</p>
                          <p className="text-sm text-gray-400">Analisando banco de talentos com IA</p>
                        </div>
                      )}

                      {/* Erro */}
                      {errorMatches && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                          <p className="text-red-800">❌ {errorMatches}</p>
                        </div>
                      )}

                      {/* Sem resultados */}
                      {buscaBancoRealizada && matches.length === 0 && (
                        <div className="text-center py-12">
                          <span className="text-6xl">🔍</span>
                          <p className="mt-4 text-gray-600 text-lg">Nenhum candidato encontrado</p>
                          <p className="text-sm text-gray-400">
                            Adicione mais pessoas ao banco de talentos ou ajuste a vaga
                          </p>
                        </div>
                      )}

                      {/* Lista de Matches */}
                      {matches.filter(m => m.score_total >= filtroScoreMin).length > 0 && (
                        <div className="space-y-3 max-h-[450px] overflow-y-auto">
                          {matches
                            .filter(m => m.score_total >= filtroScoreMin)
                            .map((match, index) => (
                              <div
                                key={match.pessoa_id}
                                className={`border-2 rounded-xl p-4 hover:shadow-lg transition-all bg-white cursor-pointer ${
                                  match.status === 'candidatura_criada' 
                                    ? 'opacity-60 border-gray-200' 
                                    : 'border-gray-100 hover:border-blue-300'
                                }`}
                                onClick={() => match.status !== 'candidatura_criada' && handleSelecionarCandidato(match)}
                              >
                                <div className="flex items-start gap-4">
                                  {/* Ranking */}
                                  <div className="text-center min-w-[45px]">
                                    <div className={`text-2xl font-bold ${
                                      index === 0 ? 'text-yellow-500' :
                                      index === 1 ? 'text-gray-400' :
                                      index === 2 ? 'text-orange-400' :
                                      'text-gray-400'
                                    }`}>
                                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                                    </div>
                                  </div>

                                  {/* Score */}
                                  <div className="text-center min-w-[80px]">
                                    <div className={`text-2xl font-bold px-3 py-1 rounded-lg ${
                                      match.score_total >= 80 ? 'text-green-600 bg-green-100' :
                                      match.score_total >= 60 ? 'text-yellow-600 bg-yellow-100' :
                                      match.score_total >= 40 ? 'text-orange-600 bg-orange-100' :
                                      'text-red-600 bg-red-100'
                                    }`}>
                                      {match.score_total}%
                                    </div>
                                    <span className="text-xs text-gray-500">Score</span>
                                  </div>

                                  {/* Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-bold text-gray-900 text-lg">{match.nome}</h4>
                                      {match.status === 'candidatura_criada' && (
                                        <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-xs font-medium">
                                          ✓ Candidatura já criada
                                        </span>
                                      )}
                                    </div>
                                    
                                    <p className="text-sm text-gray-600 mb-2">
                                      {match.titulo_profissional} | <span className="font-medium">{match.senioridade}</span>
                                    </p>

                                    {/* Skills */}
                                    {match.skills_match && match.skills_match.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mb-2">
                                        {match.skills_match.slice(0, 6).map((skill, idx) => (
                                          <span 
                                            key={idx}
                                            className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium"
                                          >
                                            ✓ {skill}
                                          </span>
                                        ))}
                                        {match.skills_match.length > 6 && (
                                          <span className="text-xs text-gray-400">
                                            +{match.skills_match.length - 6} mais
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Botão */}
                                  <div className="flex-shrink-0">
                                    {match.status === 'candidatura_criada' ? (
                                      <span className="text-gray-400 text-sm">Já adicionado</span>
                                    ) : (
                                      <button
                                        className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-2 rounded-lg hover:shadow-lg transition font-medium text-sm flex items-center gap-2"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSelecionarCandidato(match);
                                        }}
                                      >
                                        <UserPlus className="w-4 h-4" />
                                        Selecionar
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ABA: SUGESTÕES IA */}
              {abaAtiva === 'sugestoes' && (
                <div className="space-y-4">
                  {/* Se não tem vaga selecionada */}
                  {!vagaSelecionadaId && (
                    <div className="text-center py-12">
                      <Sparkles className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">Selecione uma Vaga</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Escolha uma vaga no dropdown acima para receber sugestões da IA
                      </p>
                    </div>
                  )}

                  {/* Se tem vaga */}
                  {vagaSelecionadaId && (
                    <div className="text-center py-12">
                      <div className="w-20 h-20 bg-gradient-to-r from-purple-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="w-10 h-10 text-purple-500" />
                      </div>
                      <p className="text-gray-700 text-lg font-medium mb-2">Sugestões Inteligentes</p>
                      <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                        A IA analisa o banco de talentos e sugere os melhores candidatos para a vaga selecionada.
                        Use a aba "Banco de Talentos" para ver os resultados.
                      </p>
                      <button 
                        className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-8 py-3 rounded-xl hover:shadow-lg transition font-medium flex items-center gap-2 mx-auto"
                        onClick={() => {
                          setAbaAtiva('banco');
                          handleBuscarCandidatos();
                        }}
                      >
                        <Search className="w-5 h-5" />
                        Buscar Candidatos Compatíveis
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ============================================ */}
        {/* FOOTER */}
        {/* ============================================ */}
        {!mostrarFormIndicacao && (
          <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
            <p className="text-sm text-gray-500">
              💡 Dica: Quanto maior o score, maior a compatibilidade com a vaga
            </p>
            <button
              onClick={handleFechar}
              className="px-6 py-2 text-gray-600 hover:text-gray-800 font-medium"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NovaCandidaturaModal;
