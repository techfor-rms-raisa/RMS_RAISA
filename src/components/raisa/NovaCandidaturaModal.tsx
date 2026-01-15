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
 * - 🔧 v57.5: CORRIGIDO busca de Minhas Vagas - agora inclui tabela vaga_analista_distribuicao
 * - 🆕 v57.5: Toggle "Incluir Sem Match" para candidatos sem skills cadastradas
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

  // 🆕 v57.5: Toggle para incluir candidatos sem match de skills
  const [incluirSemMatch, setIncluirSemMatch] = useState(false);

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
  // 🔧 v57.5: CORRIGIDO para incluir candidatos sem skills quando toggle ativo
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
        // Filtrar matches existentes
        filtered = filtered.filter(m => minhasPessoasIds.has(Number(m.pessoa_id)));
        
        // 🆕 v57.5: Se toggle "Incluir Sem Match" está ativo, adicionar candidatos do analista
        // que não estão nos matches (porque não têm skills ou skills não bateram)
        if (incluirSemMatch) {
          const idsJaNoMatch = new Set(filtered.map(m => m.pessoa_id));
          
          // Buscar candidatos do analista que NÃO estão nos matches
          const candidatosSemMatch = pessoas
            .filter((p: any) => {
              const analistaId = p.id_analista_rs;
              return analistaId && 
                     Number(analistaId) === Number(currentUserId) && 
                     !idsJaNoMatch.has(Number(p.id));
            })
            .map((p: any) => ({
              pessoa_id: Number(p.id),
              nome: p.nome || 'Sem nome',
              email: p.email || '',
              telefone: p.telefone || '',
              titulo_profissional: p.titulo_profissional || 'Não informado',
              senioridade: p.senioridade || 'Não informado',
              disponibilidade: p.disponibilidade || 'Não informado',
              modalidade_preferida: p.modalidade_preferida || 'Não informado',
              pretensao_salarial: p.pretensao_salarial || 0,
              score_total: 0, // Sem match = score 0
              score_skills: 0,
              score_experiencia: 0,
              score_senioridade: 0,
              skills_match: [] as string[],
              skills_faltantes: [] as string[],
              skills_extras: [] as string[],
              justificativa_ia: '⚠️ Candidato sem skills cadastradas ou sem match com a vaga',
              status: 'novo' as const,
              top_skills: [] as string[],
              anos_experiencia_total: 0
            }));
          
          console.log('🆕 Candidatos sem match adicionados:', candidatosSemMatch.length);
          filtered = [...filtered, ...candidatosSemMatch];
        }
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
  }, [matches, filtroScoreMin, filtroPessoaEscopo, pessoas, currentUserId, buscaTexto, incluirSemMatch]);

  // 🆕 Paginação
  const totalPaginas = Math.ceil(matchesFiltrados.length / ITEMS_PER_PAGE);
  const matchesPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITEMS_PER_PAGE;
    return matchesFiltrados.slice(inicio, inicio + ITEMS_PER_PAGE);
  }, [matchesFiltrados, paginaAtual]);

  // ============================================
  // EFFECTS
  // ============================================

  // 🔧 v57.5: Carregar IDs das vagas onde o analista está associado
  // CORRIGIDO: Agora busca também na tabela vaga_analista_distribuicao
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
        console.log('🔍 Buscando vagas para analista ID:', userId);
        
        const vagasIds = new Set<string>();
        
        // ============================================
        // 🆕 FONTE 1: Tabela vaga_analista_distribuicao (NOVA!)
        // Esta é a fonte PRINCIPAL de associação analista-vaga
        // ============================================
        const { data: distribuicoes, error: errorDistribuicao } = await supabase
          .from('vaga_analista_distribuicao')
          .select('vaga_id')
          .eq('analista_id', userId)
          .eq('ativo', true);
        
        if (errorDistribuicao) {
          console.warn('⚠️ Erro ao buscar distribuições:', errorDistribuicao.message);
        } else {
          console.log('📋 Vagas da distribuição:', distribuicoes?.length || 0);
          (distribuicoes || []).forEach((d: any) => {
            if (d.vaga_id) {
              vagasIds.add(String(d.vaga_id));
            }
          });
        }
        
        // ============================================
        // FONTE 2: Candidaturas onde o analista está associado
        // ============================================
        const { data: candidaturas, error: errorCandidaturas } = await supabase
          .from('candidaturas')
          .select('vaga_id, analista_id')
          .eq('analista_id', userId);
        
        if (errorCandidaturas) {
          console.warn('⚠️ Erro ao buscar candidaturas:', errorCandidaturas.message);
        } else {
          console.log('📋 Candidaturas do analista:', candidaturas?.length || 0);
          (candidaturas || []).forEach((c: any) => {
            if (c.vaga_id) {
              vagasIds.add(String(c.vaga_id));
            }
          });
        }
        
        // ============================================
        // FONTE 3: Vagas onde o analista é responsável direto
        // (campo analista_id na própria tabela vagas)
        // ============================================
        vagas.forEach((v: any) => {
          if (Number(v.analista_id) === userId || 
              Number(v.responsavel_id) === userId) {
            vagasIds.add(String(v.id));
          }
        });
        
        console.log('✅ Total Minhas Vagas IDs:', vagasIds.size, Array.from(vagasIds));
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
      setIncluirSemMatch(false);
    }
  }, [isOpen]);

  // Reset página ao mudar filtros
  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroScoreMin, filtroPessoaEscopo, buscaTexto, incluirSemMatch]);

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
        const tipoMsg = origem === 'indicacao_cliente' ? '(Indicação)' : '(Aquisição)';
        alert(`✅ Candidatura criada com sucesso! ${tipoMsg}\n\nStatus: Enviado ao Cliente`);
        
        // Callback para atualizar lista de candidaturas
        if (onCandidaturaCriada) {
          onCandidaturaCriada(parseInt(candidatura.id));
        }
        
        // Fechar modal
        handleFechar();
      }
    } catch (err: any) {
      alert(`❌ Erro ao criar candidatura: ${err.message}`);
    } finally {
      setCriandoCandidatura(null);
    }
  };

  // 🆕 Criar candidatura com status "enviado_cliente" automaticamente
  const criarCandidaturaComStatusEnviado = async (
    pessoaId: number,
    vagaId: string,
    analistaId: number,
    dadosIndicacao: any
  ) => {
    // Primeiro, criar a candidatura normal
    const candidatura = await criarCandidaturaDoMatch(
      pessoaId,
      vagaId,
      analistaId,
      dadosIndicacao
    );

    // Se criou com sucesso, atualizar para status "enviado_cliente"
    if (candidatura) {
      try {
        await supabase
          .from('candidaturas')
          .update({ status: 'enviado_cliente' })
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
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        
        {/* ============================================ */}
        {/* HEADER */}
        {/* ============================================ */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-4 rounded-t-2xl flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <UserPlus className="w-6 h-6" />
              Nova Candidatura
            </h2>
            <p className="text-orange-100 text-sm mt-0.5">
              {currentUserName && `Analista: ${currentUserName}`}
            </p>
          </div>
          <button
            onClick={handleFechar}
            className="text-white hover:bg-white/20 rounded-full p-1.5 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* ============================================ */}
        {/* CONTEÚDO */}
        {/* ============================================ */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* CANDIDATO SELECIONADO - FORMULÁRIO DE INDICAÇÃO */}
          {mostrarFormIndicacao && candidatoSelecionado && (
            <div className="space-y-5">
              {/* Card do candidato selecionado */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full flex items-center justify-center">
                    <User className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 text-lg">{candidatoSelecionado.nome}</h3>
                    <p className="text-green-700">{candidatoSelecionado.titulo_profissional}</p>
                    <p className="text-gray-500 text-sm">{candidatoSelecionado.email}</p>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${
                      candidatoSelecionado.score_total >= 70 ? 'text-green-600' :
                      candidatoSelecionado.score_total >= 50 ? 'text-yellow-600' :
                      'text-gray-500'
                    }`}>
                      {candidatoSelecionado.score_total > 0 ? `${candidatoSelecionado.score_total}%` : 'N/A'}
                    </div>
                    <div className="text-xs text-gray-500">Score</div>
                  </div>
                </div>
              </div>

              {/* Vaga selecionada */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                  <div>
                    <span className="font-medium text-blue-900">{vagaSelecionada?.titulo}</span>
                    <span className="text-blue-600 ml-2">• {vagaSelecionada?.senioridade}</span>
                  </div>
                </div>
              </div>

              {/* Formulário de origem */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Origem da Candidatura</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="origem"
                        checked={origem === 'aquisicao'}
                        onChange={() => setOrigem('aquisicao')}
                        className="w-4 h-4 text-orange-500"
                      />
                      <span className="text-gray-700">Aquisição (Banco de Talentos)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="origem"
                        checked={origem === 'indicacao_cliente'}
                        onChange={() => setOrigem('indicacao_cliente')}
                        className="w-4 h-4 text-amber-500"
                      />
                      <span className="text-gray-700">Indicação do Cliente</span>
                    </label>
                  </div>
                </div>

                {/* Campos de indicação (só aparecem se for indicação) */}
                {origem === 'indicacao_cliente' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-4">
                    <h4 className="font-medium text-amber-800 flex items-center gap-2">
                      <Award className="w-5 h-5" />
                      Dados da Indicação
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Nome de quem indicou</label>
                        <input
                          type="text"
                          value={indicadoPorNome}
                          onChange={e => setIndicadoPorNome(e.target.value)}
                          placeholder="Ex: João Silva"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Cargo de quem indicou</label>
                        <input
                          type="text"
                          value={indicadoPorCargo}
                          onChange={e => setIndicadoPorCargo(e.target.value)}
                          placeholder="Ex: Gerente de TI"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Observações da indicação</label>
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
                          {loadingMinhasVagas 
                            ? 'Carregando vagas...'
                            : vagasFiltradas.length === 0 
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

                          {/* Filtro de Score Mínimo */}
                          <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
                            <Filter className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-600">Score mín:</span>
                            <select
                              value={filtroScoreMin}
                              onChange={e => setFiltroScoreMin(Number(e.target.value))}
                              className="border-0 bg-transparent text-sm font-medium focus:ring-0"
                            >
                              <option value={0}>Todos</option>
                              <option value={30}>30%+</option>
                              <option value={50}>50%+</option>
                              <option value={70}>70%+</option>
                            </select>
                          </div>

                          {/* Filtro Escopo de Pessoas */}
                          <div className="flex items-center gap-1 bg-white rounded-lg px-2 py-1.5 border border-gray-200">
                            <button
                              onClick={() => setFiltroPessoaEscopo('minhas')}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                                filtroPessoaEscopo === 'minhas'
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'text-gray-500 hover:bg-gray-100'
                              }`}
                            >
                              Meus Candidatos
                            </button>
                            <button
                              onClick={() => setFiltroPessoaEscopo('todas')}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                                filtroPessoaEscopo === 'todas'
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'text-gray-500 hover:bg-gray-100'
                              }`}
                            >
                              Todos
                            </button>
                          </div>

                          {/* 🆕 v57.5: Toggle Incluir Sem Match */}
                          {filtroPessoaEscopo === 'minhas' && buscaBancoRealizada && (
                            <button
                              onClick={() => setIncluirSemMatch(!incluirSemMatch)}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                incluirSemMatch
                                  ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                              title="Incluir candidatos do seu banco sem match de skills"
                            >
                              {incluirSemMatch ? (
                                <ToggleRight className="w-4 h-4" />
                              ) : (
                                <ToggleLeft className="w-4 h-4" />
                              )}
                              Incluir Sem Match
                            </button>
                          )}
                        </div>

                        {/* Linha 2: Busca por texto */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Buscar por nome, cargo, email ou skill..."
                            value={buscaTexto}
                            onChange={e => setBuscaTexto(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
                          />
                        </div>
                      </div>

                      {/* Erro de busca */}
                      {errorMatches && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                          ❌ {errorMatches}
                        </div>
                      )}

                      {/* Loading */}
                      {loadingMatches && (
                        <div className="space-y-3">
                          <SkeletonCard />
                          <SkeletonCard />
                          <SkeletonCard />
                        </div>
                      )}

                      {/* Nenhum resultado */}
                      {!loadingMatches && buscaBancoRealizada && matchesFiltrados.length === 0 && (
                        <div className="text-center py-10 bg-gray-50 rounded-xl">
                          <Users className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 text-base font-medium">Nenhum candidato encontrado</p>
                          <p className="text-sm text-gray-400 mt-1">
                            {filtroPessoaEscopo === 'minhas' && !incluirSemMatch
                              ? 'Tente ativar "Incluir Sem Match" ou ajustar os filtros'
                              : 'Tente ajustar os filtros de score ou escopo'}
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
                              {incluirSemMatch && ' + sem match'}
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
                                      : match.score_total === 0
                                        ? 'border-amber-200 bg-amber-50/30'
                                        : 'border-gray-100 hover:border-orange-300'
                                  }`}
                                  onClick={() => match.status !== 'candidatura_criada' && handleSelecionarCandidato(match)}
                                >
                                  <div className="flex items-center gap-4">
                                    {/* Ranking + Score */}
                                    <div className="flex items-center gap-3 min-w-[100px]">
                                      <div className={`text-xl font-bold ${
                                        match.score_total === 0 ? 'text-amber-500' :
                                        rankingGlobal === 0 ? 'text-yellow-500' :
                                        rankingGlobal === 1 ? 'text-gray-400' :
                                        rankingGlobal === 2 ? 'text-orange-400' :
                                        'text-gray-400'
                                      }`}>
                                        {match.score_total === 0 ? '⚠️' :
                                         rankingGlobal === 0 ? '🥇' : 
                                         rankingGlobal === 1 ? '🥈' : 
                                         rankingGlobal === 2 ? '🥉' : 
                                         `#${rankingGlobal + 1}`}
                                      </div>
                                      <div className={`text-lg font-semibold ${
                                        match.score_total === 0 ? 'text-amber-500' :
                                        match.score_total >= 70 ? 'text-green-600' :
                                        match.score_total >= 50 ? 'text-yellow-600' :
                                        'text-gray-500'
                                      }`}>
                                        {match.score_total === 0 ? 'N/A' : `${match.score_total}%`}
                                      </div>
                                    </div>

                                    {/* Info do Candidato */}
                                    <div className="flex-1">
                                      <h4 className="font-semibold text-gray-800">{match.nome}</h4>
                                      <p className="text-sm text-gray-600">{match.titulo_profissional}</p>
                                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                        <span>{match.senioridade}</span>
                                        <span>•</span>
                                        <span>{match.disponibilidade}</span>
                                        {match.skills_match && match.skills_match.length > 0 && (
                                          <>
                                            <span>•</span>
                                            <span className="text-green-600">
                                              {match.skills_match.slice(0, 3).join(', ')}
                                              {match.skills_match.length > 3 && ` +${match.skills_match.length - 3}`}
                                            </span>
                                          </>
                                        )}
                                        {match.score_total === 0 && (
                                          <span className="text-amber-600 font-medium">
                                            Sem skills cadastradas
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Botão de Seleção */}
                                    <div>
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
