/**
 * NovaCandidaturaModal.tsx - Modal de Nova Candidatura
 * 
 * REDESENHADO v3.2:
 * - ✅ Paginação melhorada com controles intuitivos
 * - ✅ Filtros por Analista (minhas vagas/pessoas vs todas)
 * - ✅ UX aprimorada com cards compactos e responsivos
 * - ✅ Status automático "enviado_cliente" ao criar candidatura
 * - ✅ Busca incremental com debounce
 * - ✅ Skeleton loading
 * - 🆕 v57.1: "Minhas Vagas" agora considera candidaturas onde o analista está associado
 * - 🔧 v57.2: Corrigida query - removido criado_por, adicionado logs de debug
 * - 🔧 v57.4: Corrigido filtro "Minhas Pessoas" - usar id_analista_rs em vez de campos inexistentes
 * 
 * Data: 15/01/2026
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  X, Search, Sparkles, 
  CheckCircle, Loader2,
  User, UserPlus, Users, Award, Building2,
  ChevronLeft, ChevronRight, Filter, ToggleLeft, ToggleRight,
  Briefcase, Star, Clock, MapPin
} from 'lucide-react';
import { Vaga, Pessoa } from '@/types';
import { useRaisaCVSearch, CandidatoMatch } from '@/hooks/supabase/useRaisaCVSearch';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

interface NovaCandidaturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  vagas: Vaga[];
  pessoas?: Pessoa[];
  onCandidaturaCriada?: (candidaturaId: number) => void;
  currentUserId: number;
  currentUserName?: string;
  vagaPreSelecionada?: Vaga;
}

type AbaAtiva = 'banco' | 'sugestoes';
type FiltroEscopo = 'minhas' | 'todas';

// ============================================
// CONSTANTES
// ============================================

const ITEMS_PER_PAGE = 5;

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const NovaCandidaturaModal: React.FC<NovaCandidaturaModalProps> = ({
  isOpen,
  onClose,
  vagas,
  pessoas = [],
  onCandidaturaCriada,
  currentUserId,
  currentUserName = 'Analista',
  vagaPreSelecionada
}) => {
  // Estados do Modal
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('banco');
  const [vagaSelecionadaId, setVagaSelecionadaId] = useState<string>('');
  
  // 🆕 Estados de Filtro por Escopo (Analista)
  const [filtroVagaEscopo, setFiltroVagaEscopo] = useState<FiltroEscopo>('minhas');
  const [filtroPessoaEscopo, setFiltroPessoaEscopo] = useState<FiltroEscopo>('minhas');
  
  // 🆕 v57.1: Estado para armazenar IDs das vagas onde o analista está associado
  const [minhasVagasIds, setMinhasVagasIds] = useState<Set<string>>(new Set());
  const [loadingMinhasVagas, setLoadingMinhasVagas] = useState(false);
  
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
    criarCandidaturaDoMatch,
    setMatches
  } = useRaisaCVSearch();

  // Estados para aba Banco de Talentos
  const [buscaBancoRealizada, setBuscaBancoRealizada] = useState(false);
  const [criandoCandidatura, setCriandoCandidatura] = useState<number | null>(null);
  const [filtroScoreMin, setFiltroScoreMin] = useState<number>(0);
  
  // 🆕 Estados de Paginação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [buscaTexto, setBuscaTexto] = useState('');

  // Vaga selecionada
  const vagaSelecionada = vagas.find(v => String(v.id) === String(vagaSelecionadaId));

  // ============================================
  // 🆕 FILTROS POR ANALISTA
  // ============================================

  // Vagas filtradas por escopo (minhas ou todas)
  const vagasFiltradas = useMemo(() => {
    const vagasAbertas = vagas.filter(v => v.status === 'aberta' || v.status === 'em_andamento');
    
    console.log('🔄 vagasFiltradas recalculando:', {
      filtroVagaEscopo,
      minhasVagasIds: Array.from(minhasVagasIds),
      totalVagasAbertas: vagasAbertas.length
    });
    
    // 🆕 v57.3: Filtrar usando minhasVagasIds (baseado em candidaturas)
    if (filtroVagaEscopo === 'minhas') {
      const filtradas = vagasAbertas.filter(v => minhasVagasIds.has(String(v.id)));
      console.log('📋 Vagas filtradas (minhas):', filtradas.length);
      return filtradas;
    }
    
    console.log('📋 Vagas filtradas (todas):', vagasAbertas.length);
    return vagasAbertas;
  }, [vagas, filtroVagaEscopo, minhasVagasIds]);

  // Matches filtrados por escopo de pessoa + score + busca texto
  const matchesFiltrados = useMemo(() => {
    let filtered = matches.filter(m => m.score_total >= filtroScoreMin);
    
    // Filtro por escopo de pessoa (minhas pessoas)
    // 🔧 v57.4: Corrigido para usar id_analista_rs (campo correto da tabela pessoas)
    if (filtroPessoaEscopo === 'minhas' && pessoas.length > 0) {
      const minhasPessoasIds = new Set(
        pessoas
          .filter((p: any) => {
            // Comparar com id_analista_rs (campo correto)
            const analistaId = p.id_analista_rs;
            return analistaId && Number(analistaId) === Number(currentUserId);
          })
          .map((p: any) => Number(p.id))
      );
      
      console.log('🔍 Filtro Minhas Pessoas:', {
        currentUserId,
        totalPessoas: pessoas.length,
        minhasPessoasCount: minhasPessoasIds.size,
        minhasPessoasIds: Array.from(minhasPessoasIds).slice(0, 10)
      });
      
      if (minhasPessoasIds.size > 0) {
        filtered = filtered.filter(m => minhasPessoasIds.has(Number(m.pessoa_id)));
      }
    }
    
    // Filtro por texto de busca
    if (buscaTexto.trim()) {
      const termo = buscaTexto.toLowerCase();
      filtered = filtered.filter(m => 
        m.nome.toLowerCase().includes(termo) ||
        m.titulo_profissional?.toLowerCase().includes(termo) ||
        m.email?.toLowerCase().includes(termo) ||
        m.skills_match?.some(s => s.toLowerCase().includes(termo))
      );
    }
    
    return filtered;
  }, [matches, filtroScoreMin, filtroPessoaEscopo, pessoas, currentUserId, buscaTexto]);

  // 🆕 Paginação
  const totalPaginas = Math.ceil(matchesFiltrados.length / ITEMS_PER_PAGE);
  const matchesPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITEMS_PER_PAGE;
    return matchesFiltrados.slice(inicio, inicio + ITEMS_PER_PAGE);
  }, [matchesFiltrados, paginaAtual]);

  // ============================================
  // EFFECTS
  // ============================================

  // 🆕 v57.2: Carregar IDs das vagas onde o analista está associado
  useEffect(() => {
    const carregarMinhasVagas = async () => {
      if (!isOpen) {
        return;
      }
      
      if (!currentUserId) {
        console.warn('⚠️ currentUserId não definido');
        return;
      }
      
      setLoadingMinhasVagas(true);
      try {
        const userId = Number(currentUserId);
        console.log('🔍 Buscando vagas para analista ID:', userId, 'tipo:', typeof userId);
        
        // Buscar TODAS as candidaturas para debug
        const { data: todasCandidaturas, error: errorTodas } = await supabase
          .from('candidaturas')
          .select('id, vaga_id, analista_id, candidato_nome');
        
        console.log('📋 TODAS as candidaturas:', todasCandidaturas?.length || 0);
        
        if (todasCandidaturas && todasCandidaturas.length > 0) {
          // Verificar os analista_id únicos
          const analistaIds = [...new Set(todasCandidaturas.map(c => c.analista_id))];
          console.log('👥 Analista IDs únicos nas candidaturas:', analistaIds);
          
          // Filtrar manualmente pelo analista_id
          const minhasCandidaturas = todasCandidaturas.filter(c => 
            Number(c.analista_id) === userId
          );
          console.log('📌 Candidaturas do analista', userId, ':', minhasCandidaturas.length, minhasCandidaturas);
        }
        
        const vagasIds = new Set<string>();
        
        // Adicionar vagas das candidaturas filtradas
        (todasCandidaturas || []).forEach((c: any) => {
          if (c.vaga_id && Number(c.analista_id) === userId) {
            vagasIds.add(String(c.vaga_id));
          }
        });
        
        // Adicionar vagas onde o analista é responsável direto (do array de vagas)
        vagas.forEach((v: any) => {
          if (Number(v.analista_id) === userId || 
              Number(v.responsavel_id) === userId) {
            vagasIds.add(String(v.id));
          }
        });
        
        console.log('✅ Minhas Vagas IDs final:', Array.from(vagasIds), 'Total:', vagasIds.size);
        setMinhasVagasIds(vagasIds);
      } catch (err) {
        console.error('❌ Erro ao carregar minhas vagas:', err);
      } finally {
        setLoadingMinhasVagas(false);
      }
    };
    
    carregarMinhasVagas();
  }, [isOpen, currentUserId, vagas]);

  // Pré-selecionar vaga se fornecida
  useEffect(() => {
    if (vagaPreSelecionada) {
      setVagaSelecionadaId(String(vagaPreSelecionada.id));
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
      setPaginaAtual(1);
      setBuscaTexto('');
      setMatches([]);
    }
  }, [isOpen]);

  // Reset página ao mudar filtros
  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroScoreMin, filtroPessoaEscopo, buscaTexto]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleFechar = () => {
    onClose();
  };

  const handleBuscarCandidatos = async () => {
    if (vagaSelecionada) {
      setBuscaBancoRealizada(false);
      setPaginaAtual(1);
      await buscarParaVaga(vagaSelecionada);
      setBuscaBancoRealizada(true);
    }
  };

  const handleSelecionarCandidato = (match: CandidatoMatch) => {
    setCandidatoSelecionado(match);
    setMostrarFormIndicacao(true);
  };

  // 🆕 Criar candidatura com status "enviado_cliente"
  const handleCriarCandidatura = async () => {
    if (!candidatoSelecionado || !vagaSelecionada) return;
    
    setCriandoCandidatura(candidatoSelecionado.pessoa_id);
    
    try {
      // Criar candidatura com dados de indicação
      const dadosIndicacao = origem === 'indicacao_cliente' ? {
        origem: 'indicacao_cliente' as const,
        indicado_por_nome: indicadoPorNome || undefined,
        indicado_por_cargo: indicadoPorCargo || undefined,
        indicacao_observacoes: indicacaoObservacoes || undefined,
        // 🆕 Status automático "enviado_cliente"
        status_inicial: 'enviado_cliente'
      } : {
        origem: 'aquisicao' as const,
        // 🆕 Status automático "enviado_cliente"
        status_inicial: 'enviado_cliente'
      };

      const candidatura = await criarCandidaturaComStatusEnviado(
        candidatoSelecionado.pessoa_id,
        vagaSelecionada.id,
        currentUserId,
        dadosIndicacao
      );
      
      if (candidatura) {
        const tipoMsg = origem === 'indicacao_cliente' ? '📋 INDICAÇÃO' : '🔍 AQUISIÇÃO';
        alert(`✅ Candidatura criada com sucesso!\n${tipoMsg}\nCandidato: ${candidatoSelecionado.nome}\nVaga: ${vagaSelecionada.titulo}\n\n📤 Status: Enviado ao Cliente`);
        
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

  // 🆕 Função para criar candidatura com status "enviado_cliente"
  const criarCandidaturaComStatusEnviado = async (
    pessoaId: number,
    vagaId: string,
    analistaId: number,
    dadosIndicacao: any
  ) => {
    // Usar o hook mas sobrescrever o status
    const candidatura = await criarCandidaturaDoMatch(
      pessoaId,
      vagaId,
      analistaId,
      {
        ...dadosIndicacao,
        // 🆕 Forçar status "enviado_cliente"
        origem: dadosIndicacao.origem
      }
    );

    // Se criou com sucesso, atualizar status para "enviado_cliente"
    if (candidatura) {
      try {
        const { supabase } = await import('@/config/supabase');
        await supabase
          .from('candidaturas')
          .update({ 
            status: 'enviado_cliente',
            enviado_cliente_em: new Date().toISOString(),
            enviado_cliente_por: analistaId
          })
          .eq('id', candidatura.id);
        
        console.log(`✅ Status atualizado para "enviado_cliente" - Candidatura #${candidatura.id}`);
      } catch (err) {
        console.warn('⚠️ Não foi possível atualizar status para enviado_cliente:', err);
      }
    }

    return candidatura;
  };

  const handleCancelarIndicacao = () => {
    setCandidatoSelecionado(null);
    setMostrarFormIndicacao(false);
    setOrigem('aquisicao');
    setIndicadoPorNome('');
    setIndicadoPorCargo('');
    setIndicacaoObservacoes('');
  };

  // Navegação de página
  const irParaPagina = (pagina: number) => {
    if (pagina >= 1 && pagina <= totalPaginas) {
      setPaginaAtual(pagina);
    }
  };

  // ============================================
  // RENDER: NÃO ABERTO
  // ============================================

  if (!isOpen) return null;

  // ============================================
  // RENDER: SKELETON LOADING
  // ============================================

  const SkeletonCard = () => (
    <div className="border-2 border-gray-100 rounded-xl p-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gray-200 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
        <div className="w-20 h-8 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );

  // ============================================
  // RENDER: MODAL
  // ============================================

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* ============================================ */}
        {/* HEADER */}
        {/* ============================================ */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-5">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <UserPlus className="w-6 h-6" />
                Nova Candidatura
              </h2>
              <p className="text-orange-100 text-sm mt-1">
                Selecione um candidato do banco de talentos para criar a candidatura
              </p>
            </div>
            <button 
              onClick={handleFechar}
              className="text-white hover:text-orange-200 p-2 hover:bg-white/10 rounded-lg transition"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* ============================================ */}
        {/* ABAS */}
        {/* ============================================ */}
        {!mostrarFormIndicacao && (
          <div className="bg-gray-50 px-4 py-3 flex gap-2 border-b">
            <button 
              onClick={() => setAbaAtiva('banco')}
              className={`px-5 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 text-sm ${
                abaAtiva === 'banco' 
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md' 
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <Search className="w-4 h-4" /> Banco de Talentos
            </button>
            <button 
              onClick={() => setAbaAtiva('sugestoes')}
              className={`px-5 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 text-sm ${
                abaAtiva === 'sugestoes' 
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md' 
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <Sparkles className="w-4 h-4" /> Sugestões IA
            </button>
          </div>
        )}

        {/* ============================================ */}
        {/* CONTEÚDO */}
        {/* ============================================ */}
        <div className="flex-1 overflow-y-auto p-5">
          
          {/* FORMULÁRIO DE INDICAÇÃO (quando candidato selecionado) */}
          {mostrarFormIndicacao && candidatoSelecionado && (
            <div className="space-y-5">
              {/* Card do Candidato Selecionado */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
                    {candidatoSelecionado.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-800">{candidatoSelecionado.nome}</h3>
                    <p className="text-gray-600 text-sm">{candidatoSelecionado.titulo_profissional} | {candidatoSelecionado.senioridade}</p>
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

              {/* Aviso de Status Automático */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    📤
                  </div>
                  <div>
                    <p className="font-semibold text-purple-800">Status Automático</p>
                    <p className="text-sm text-purple-600">
                      A candidatura será criada com status <strong>"Enviado ao Cliente"</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* ORIGEM DO CANDIDATO */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  🎯 Origem do Candidato
                </label>
                <div className="flex flex-wrap gap-3">
                  <label className={`flex items-center px-4 py-2.5 rounded-xl cursor-pointer transition-all ${
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
                    <Search className="w-4 h-4 mr-2" />
                    <div>
                      <span className="font-medium text-sm">Aquisição Própria</span>
                      <p className="text-xs opacity-75">Candidato encontrado pelo analista</p>
                    </div>
                  </label>
                  <label className={`flex items-center px-4 py-2.5 rounded-xl cursor-pointer transition-all ${
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
                    <Building2 className="w-4 h-4 mr-2" />
                    <div>
                      <span className="font-medium text-sm">Indicação do Cliente</span>
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
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16 focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Botões de Ação */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleCancelarIndicacao}
                  className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition font-medium text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCriarCandidatura}
                  disabled={criandoCandidatura !== null}
                  className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:shadow-lg transition font-semibold flex items-center gap-2 disabled:opacity-50 text-sm"
                >
                  {criandoCandidatura ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Criar e Enviar ao Cliente
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* BUSCA NORMAL (quando não há candidato selecionado) */}
          {!mostrarFormIndicacao && (
            <>
              {/* ============================================ */}
              {/* 🆕 FILTROS DE ESCOPO + SELEÇÃO DE VAGA */}
              {/* ============================================ */}
              <div className="space-y-4 mb-5">
                {/* Linha 1: Toggle de Escopo de Vagas + Seleção de Vaga */}
                <div className="flex flex-col lg:flex-row gap-3">
                  {/* Toggle Minhas Vagas / Todas */}
                  <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-2">
                    <button
                      onClick={() => setFiltroVagaEscopo('minhas')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        filtroVagaEscopo === 'minhas'
                          ? 'bg-white text-orange-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <User className="w-4 h-4" />
                      Minhas Vagas
                    </button>
                    <button
                      onClick={() => setFiltroVagaEscopo('todas')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        filtroVagaEscopo === 'todas'
                          ? 'bg-white text-orange-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      Todas as Vagas
                    </button>
                  </div>

                  {/* Dropdown de Seleção de Vaga */}
                  <div className="flex-1">
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <select 
                        value={vagaSelecionadaId}
                        onChange={e => {
                          setVagaSelecionadaId(e.target.value);
                          setBuscaBancoRealizada(false);
                          setPaginaAtual(1);
                        }}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 pl-10 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 text-sm"
                      >
                        <option value="">
                          {vagasFiltradas.length === 0 
                            ? `Nenhuma vaga ${filtroVagaEscopo === 'minhas' ? 'associada a você' : 'disponível'}...`
                            : 'Selecione uma vaga para buscar candidatos...'}
                        </option>
                        {vagasFiltradas.map(v => (
                          <option key={v.id} value={String(v.id)}>
                            {v.titulo} - {v.senioridade} 
                            {v.stack_tecnologica && ` (${Array.isArray(v.stack_tecnologica) ? v.stack_tecnologica.slice(0, 3).join(', ') : v.stack_tecnologica})`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 ml-1">
                      {vagasFiltradas.length} vaga(s) {filtroVagaEscopo === 'minhas' ? 'associada(s) a você' : 'disponíveis'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ABA: BANCO DE TALENTOS */}
              {abaAtiva === 'banco' && (
                <div className="space-y-4">
                  {/* Se não tem vaga selecionada */}
                  {!vagaSelecionadaId && (
                    <div className="text-center py-10 bg-gray-50 rounded-xl">
                      <Search className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-base font-medium">Selecione uma Vaga</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Escolha uma vaga acima para buscar candidatos compatíveis
                      </p>
                    </div>
                  )}

                  {/* Se tem vaga, mostrar busca */}
                  {vagaSelecionadaId && (
                    <>
                      {/* Toolbar de busca */}
                      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                        {/* Linha 1: Botão Buscar + Filtros */}
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={handleBuscarCandidatos}
                            disabled={loadingMatches}
                            className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-5 py-2.5 rounded-xl hover:shadow-lg disabled:opacity-50 transition font-medium text-sm"
                          >
                            {loadingMatches ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Buscando...
                              </>
                            ) : (
                              <>
                                <Search className="w-4 h-4" />
                                Buscar Candidatos
                              </>
                            )}
                          </button>

                          {/* Score Mínimo */}
                          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border text-sm">
                            <Star className="w-4 h-4 text-yellow-500" />
                            <span className="text-gray-600">Score mín:</span>
                            <input
                              type="number"
                              value={filtroScoreMin}
                              onChange={e => setFiltroScoreMin(parseInt(e.target.value) || 0)}
                              min={0}
                              max={100}
                              className="border-none focus:ring-0 w-12 text-center font-medium"
                            />
                            <span className="text-gray-400">%</span>
                          </div>

                          {/* Toggle Meus Candidatos / Todas */}
                          {buscaBancoRealizada && (
                            <div className="flex items-center gap-1 bg-white rounded-lg border p-1">
                              <button
                                onClick={() => setFiltroPessoaEscopo('minhas')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                  filtroPessoaEscopo === 'minhas'
                                    ? 'bg-orange-100 text-orange-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                <User className="w-3.5 h-3.5" />
                                Meus Candidatos
                              </button>
                              <button
                                onClick={() => setFiltroPessoaEscopo('todas')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                  filtroPessoaEscopo === 'todas'
                                    ? 'bg-orange-100 text-orange-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                <Users className="w-3.5 h-3.5" />
                                Todas
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Linha 2: Busca por texto (aparece após buscar) */}
                        {buscaBancoRealizada && matches.length > 0 && (
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              value={buscaTexto}
                              onChange={e => setBuscaTexto(e.target.value)}
                              placeholder="Filtrar por nome, cargo ou skill..."
                              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                            />
                          </div>
                        )}
                      </div>

                      {/* Loading */}
                      {loadingMatches && !buscaBancoRealizada && (
                        <div className="space-y-3">
                          <SkeletonCard />
                          <SkeletonCard />
                          <SkeletonCard />
                        </div>
                      )}

                      {/* Erro */}
                      {errorMatches && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                          <p className="text-red-800 text-sm">❌ {errorMatches}</p>
                        </div>
                      )}

                      {/* Sem resultados */}
                      {buscaBancoRealizada && matchesFiltrados.length === 0 && (
                        <div className="text-center py-10 bg-gray-50 rounded-xl">
                          <span className="text-5xl">🔍</span>
                          <p className="mt-3 text-gray-600 text-base">Nenhum candidato encontrado</p>
                          <p className="text-sm text-gray-400 mt-1">
                            {matches.length > 0 
                              ? 'Tente ajustar os filtros de score ou escopo'
                              : 'Adicione mais pessoas ao banco de talentos'}
                          </p>
                        </div>
                      )}

                      {/* 🆕 LISTA DE CANDIDATOS COM PAGINAÇÃO */}
                      {matchesFiltrados.length > 0 && (
                        <>
                          {/* Info de resultados */}
                          <div className="flex items-center justify-between text-sm text-gray-500 px-1">
                            <span className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              {matchesFiltrados.length} candidato(s) encontrado(s)
                              {filtroPessoaEscopo === 'minhas' && ' (filtrado)'}
                            </span>
                            <span>
                              Página {paginaAtual} de {totalPaginas}
                            </span>
                          </div>

                          {/* Lista de Matches */}
                          <div className="space-y-3">
                            {matchesPaginados.map((match, index) => {
                              const rankingGlobal = (paginaAtual - 1) * ITEMS_PER_PAGE + index;
                              
                              return (
                                <div
                                  key={match.pessoa_id}
                                  className={`border-2 rounded-xl p-4 hover:shadow-md transition-all bg-white cursor-pointer ${
                                    match.status === 'candidatura_criada' 
                                      ? 'opacity-60 border-gray-200 cursor-not-allowed' 
                                      : 'border-gray-100 hover:border-orange-300'
                                  }`}
                                  onClick={() => match.status !== 'candidatura_criada' && handleSelecionarCandidato(match)}
                                >
                                  <div className="flex items-center gap-4">
                                    {/* Ranking + Score */}
                                    <div className="flex items-center gap-3 min-w-[100px]">
                                      <div className={`text-xl font-bold ${
                                        rankingGlobal === 0 ? 'text-yellow-500' :
                                        rankingGlobal === 1 ? 'text-gray-400' :
                                        rankingGlobal === 2 ? 'text-orange-400' :
                                        'text-gray-400'
                                      }`}>
                                        {rankingGlobal === 0 ? '🥇' : rankingGlobal === 1 ? '🥈' : rankingGlobal === 2 ? '🥉' : `#${rankingGlobal + 1}`}
                                      </div>
                                      <div className={`text-xl font-bold px-2.5 py-1 rounded-lg ${
                                        match.score_total >= 80 ? 'text-green-600 bg-green-50' :
                                        match.score_total >= 60 ? 'text-yellow-600 bg-yellow-50' :
                                        match.score_total >= 40 ? 'text-orange-600 bg-orange-50' :
                                        'text-red-600 bg-red-50'
                                      }`}>
                                        {match.score_total}%
                                      </div>
                                    </div>

                                    {/* Info do Candidato */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-bold text-gray-900 truncate">{match.nome}</h4>
                                        {match.status === 'candidatura_criada' && (
                                          <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">
                                            ✓ Já adicionado
                                          </span>
                                        )}
                                      </div>
                                      
                                      <p className="text-sm text-gray-600 truncate">
                                        {match.titulo_profissional} | <span className="font-medium">{match.senioridade}</span>
                                      </p>

                                      {/* Skills */}
                                      {match.skills_match && match.skills_match.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                          {match.skills_match.slice(0, 5).map((skill, idx) => (
                                            <span 
                                              key={idx}
                                              className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-medium"
                                            >
                                              ✓ {skill}
                                            </span>
                                          ))}
                                          {match.skills_match.length > 5 && (
                                            <span className="text-xs text-gray-400 px-1">
                                              +{match.skills_match.length - 5}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {/* Botão Selecionar */}
                                    <div className="flex-shrink-0">
                                      {match.status === 'candidatura_criada' ? (
                                        <span className="text-gray-400 text-xs">Já adicionado</span>
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
                              );
                            })}
                          </div>

                          {/* 🆕 CONTROLES DE PAGINAÇÃO */}
                          {totalPaginas > 1 && (
                            <div className="flex items-center justify-center gap-2 pt-4">
                              <button
                                onClick={() => irParaPagina(1)}
                                disabled={paginaAtual === 1}
                                className="flex items-center p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                                title="Primeira página"
                              >
                                <ChevronLeft className="w-4 h-4" />
                                <ChevronLeft className="w-4 h-4 -ml-2.5" />
                              </button>
                              
                              <button
                                onClick={() => irParaPagina(paginaAtual - 1)}
                                disabled={paginaAtual === 1}
                                className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                                title="Página anterior"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>

                              {/* Números das páginas */}
                              <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                                  let pageNum;
                                  if (totalPaginas <= 5) {
                                    pageNum = i + 1;
                                  } else if (paginaAtual <= 3) {
                                    pageNum = i + 1;
                                  } else if (paginaAtual >= totalPaginas - 2) {
                                    pageNum = totalPaginas - 4 + i;
                                  } else {
                                    pageNum = paginaAtual - 2 + i;
                                  }
                                  
                                  return (
                                    <button
                                      key={pageNum}
                                      onClick={() => irParaPagina(pageNum)}
                                      className={`w-9 h-9 rounded-lg font-medium text-sm transition-all ${
                                        paginaAtual === pageNum
                                          ? 'bg-orange-500 text-white shadow-md'
                                          : 'border border-gray-200 hover:bg-gray-50 text-gray-600'
                                      }`}
                                    >
                                      {pageNum}
                                    </button>
                                  );
                                })}
                              </div>

                              <button
                                onClick={() => irParaPagina(paginaAtual + 1)}
                                disabled={paginaAtual === totalPaginas}
                                className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                                title="Próxima página"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => irParaPagina(totalPaginas)}
                                disabled={paginaAtual === totalPaginas}
                                className="flex items-center p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                                title="Última página"
                              >
                                <ChevronRight className="w-4 h-4" />
                                <ChevronRight className="w-4 h-4 -ml-2.5" />
                              </button>
                            </div>
                          )}
                        </>
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
                    <div className="text-center py-10 bg-gray-50 rounded-xl">
                      <Sparkles className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-base font-medium">Selecione uma Vaga</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Escolha uma vaga no dropdown acima para receber sugestões da IA
                      </p>
                    </div>
                  )}

                  {/* Se tem vaga */}
                  {vagaSelecionadaId && (
                    <div className="text-center py-10 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl">
                      <div className="w-16 h-16 bg-gradient-to-r from-purple-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="w-8 h-8 text-purple-500" />
                      </div>
                      <p className="text-gray-700 font-medium mb-2">Sugestões Inteligentes</p>
                      <p className="text-sm text-gray-500 mb-5 max-w-md mx-auto">
                        A IA analisa o banco de talentos e sugere os melhores candidatos.
                        Use a aba "Banco de Talentos" para ver os resultados.
                      </p>
                      <button 
                        className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-6 py-2.5 rounded-xl hover:shadow-lg transition font-medium flex items-center gap-2 mx-auto text-sm"
                        onClick={() => {
                          setAbaAtiva('banco');
                          handleBuscarCandidatos();
                        }}
                      >
                        <Search className="w-4 h-4" />
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
          <div className="bg-gray-50 px-5 py-3 flex justify-between items-center border-t">
            <p className="text-xs text-gray-500">
              💡 Dica: Candidaturas são criadas com status <strong>"Enviado ao Cliente"</strong>
            </p>
            <button
              onClick={handleFechar}
              className="px-5 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
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
