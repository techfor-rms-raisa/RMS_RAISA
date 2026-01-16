/**
 * NovaCandidaturaModal.tsx - Modal de Nova Candidatura
 * 
 * 🆕 v57.7 - SIMPLIFICADO:
 * - "Meus Candidatos" busca DIRETO do banco (pessoas.id_analista_rs = analista_logado)
 * - NÃO depende de match de skills para exibir candidatos
 * - Campo de busca filtra por nome em tempo real
 * - Mais simples e intuitivo para o analista
 * 
 * HISTÓRICO:
 * - v57.7 (15/01/2026): Meus Candidatos busca direto do banco, sem match
 * - v57.5: Minhas Vagas inclui vaga_analista_distribuicao
 * - v57.4: Corrigido filtro para usar id_analista_rs
 * 
 * Data: 15/01/2026
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Search, Sparkles, 
  CheckCircle, Loader2,
  User, UserPlus, Users, Award, Building2,
  ChevronLeft, ChevronRight,
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

// Interface para candidato do analista (busca direta)
interface MeuCandidato {
  id: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  titulo_profissional: string | null;
  senioridade: string | null;
  disponibilidade: string | null;
  cidade: string | null;
  estado: string | null;
  total_skills: number;
}

type FiltroEscopo = 'minhas' | 'todas';

// ============================================
// CONSTANTES
// ============================================

const ITEMS_PER_PAGE = 8;

// ============================================
// FUNÇÃO: Criar candidatura com status enviado_cliente
// ============================================

async function criarCandidaturaComStatusEnviado(
  pessoaId: number,
  vagaId: number | string,
  analistaId: number,
  dados?: {
    origem?: 'aquisicao' | 'indicacao_cliente';
    indicado_por_nome?: string;
    indicado_por_cargo?: string;
    indicacao_observacoes?: string;
    status_inicial?: string;
  }
): Promise<any> {
  try {
    // Buscar dados da pessoa
    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('nome, email')
      .eq('id', pessoaId)
      .single();

    // Criar candidatura
    const { data, error } = await supabase
      .from('candidaturas')
      .insert({
        pessoa_id: pessoaId,
        vaga_id: Number(vagaId),
        status: dados?.status_inicial || 'enviado_cliente',
        analista_id: analistaId,
        candidato_nome: pessoa?.nome || '',
        candidato_email: pessoa?.email || '',
        origem: dados?.origem || 'aquisicao',
        indicado_por_nome: dados?.indicado_por_nome,
        indicado_por_cargo: dados?.indicado_por_cargo,
        indicacao_observacoes: dados?.indicacao_observacoes,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Erro ao criar candidatura:', err);
    return null;
  }
}

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
  // ============================================
  // ESTADOS
  // ============================================
  
  const [vagaSelecionadaId, setVagaSelecionadaId] = useState<string>('');
  
  // Filtros de escopo
  const [filtroVagaEscopo, setFiltroVagaEscopo] = useState<FiltroEscopo>('minhas');
  const [filtroPessoaEscopo, setFiltroPessoaEscopo] = useState<FiltroEscopo>('minhas');
  
  // Minhas Vagas (carregado do banco)
  const [minhasVagasIds, setMinhasVagasIds] = useState<Set<string>>(new Set());
  const [loadingMinhasVagas, setLoadingMinhasVagas] = useState(false);
  
  // 🆕 v57.7: Meus Candidatos (busca direta do banco)
  const [meusCandidatos, setMeusCandidatos] = useState<MeuCandidato[]>([]);
  const [loadingMeusCandidatos, setLoadingMeusCandidatos] = useState(false);
  
  // Formulário de indicação
  const [candidatoSelecionado, setCandidatoSelecionado] = useState<any>(null);
  const [mostrarFormIndicacao, setMostrarFormIndicacao] = useState(false);
  const [origem, setOrigem] = useState<'aquisicao' | 'indicacao_cliente'>('aquisicao');
  const [indicadoPorNome, setIndicadoPorNome] = useState('');
  const [indicadoPorCargo, setIndicadoPorCargo] = useState('');
  const [indicacaoObservacoes, setIndicacaoObservacoes] = useState('');

  // Hook de busca (usado apenas no modo "Todos")
  const {
    matches,
    loading: loadingMatches,
    buscarParaVaga,
    setMatches
  } = useRaisaCVSearch();

  // Estados gerais
  const [buscaBancoRealizada, setBuscaBancoRealizada] = useState(false);
  const [criandoCandidatura, setCriandoCandidatura] = useState<number | null>(null);
  
  // Paginação e busca
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [buscaTexto, setBuscaTexto] = useState('');

  // Vaga selecionada
  const vagaSelecionada = vagas.find(v => String(v.id) === String(vagaSelecionadaId));

  // ============================================
  // 🆕 v57.7: CARREGAR MEUS CANDIDATOS DO BANCO
  // Busca: pessoas.id_analista_rs = currentUserId
  // ============================================
  
  useEffect(() => {
    const carregarMeusCandidatos = async () => {
      if (!isOpen || !currentUserId) return;
      
      setLoadingMeusCandidatos(true);
      try {
        console.log('🔍 [Modal] Buscando candidatos do analista:', currentUserId);
        
        // Buscar pessoas do analista
        const { data, error } = await supabase
          .from('pessoas')
          .select(`
            id,
            nome,
            email,
            telefone,
            titulo_profissional,
            senioridade,
            disponibilidade,
            cidade,
            estado
          `)
          .eq('id_analista_rs', currentUserId)
          .order('nome');
        
        if (error) {
          console.error('❌ Erro ao buscar meus candidatos:', error);
          return;
        }
        
        // Buscar contagem de skills para cada pessoa
        const candidatosComSkills: MeuCandidato[] = await Promise.all(
          (data || []).map(async (p) => {
            const { count } = await supabase
              .from('pessoa_skills')
              .select('*', { count: 'exact', head: true })
              .eq('pessoa_id', p.id);
            
            return {
              ...p,
              total_skills: count || 0
            };
          })
        );
        
        console.log('✅ [Modal] Meus candidatos carregados:', candidatosComSkills.length);
        setMeusCandidatos(candidatosComSkills);
        
      } catch (err) {
        console.error('❌ Erro ao carregar meus candidatos:', err);
      } finally {
        setLoadingMeusCandidatos(false);
      }
    };
    
    carregarMeusCandidatos();
  }, [isOpen, currentUserId]);

  // ============================================
  // CARREGAR MINHAS VAGAS
  // ============================================
  
  useEffect(() => {
    const carregarMinhasVagas = async () => {
      if (!isOpen || !currentUserId) return;
      
      setLoadingMinhasVagas(true);
      try {
        const userId = Number(currentUserId);
        const vagasIds = new Set<string>();
        
        // FONTE 1: vaga_analista_distribuicao (PRINCIPAL)
        const { data: distribuicoes } = await supabase
          .from('vaga_analista_distribuicao')
          .select('vaga_id')
          .eq('analista_id', userId)
          .eq('ativo', true);
        
        (distribuicoes || []).forEach((d: any) => {
          if (d.vaga_id) vagasIds.add(String(d.vaga_id));
        });
        
        // FONTE 2: Candidaturas
        const { data: candidaturas } = await supabase
          .from('candidaturas')
          .select('vaga_id')
          .eq('analista_id', userId);
        
        (candidaturas || []).forEach((c: any) => {
          if (c.vaga_id) vagasIds.add(String(c.vaga_id));
        });
        
        // FONTE 3: Vagas diretas
        vagas.forEach((v: any) => {
          if (Number(v.analista_id) === userId || Number(v.responsavel_id) === userId) {
            vagasIds.add(String(v.id));
          }
        });
        
        console.log('✅ [Modal] Minhas Vagas:', vagasIds.size);
        setMinhasVagasIds(vagasIds);
        
      } catch (err) {
        console.error('❌ Erro ao carregar minhas vagas:', err);
      } finally {
        setLoadingMinhasVagas(false);
      }
    };
    
    carregarMinhasVagas();
  }, [isOpen, currentUserId, vagas]);

  // ============================================
  // FILTROS
  // ============================================

  // Vagas filtradas
  const vagasFiltradas = useMemo(() => {
    const vagasAbertas = vagas.filter(v => v.status === 'aberta' || v.status === 'em_andamento');
    
    if (filtroVagaEscopo === 'minhas') {
      return vagasAbertas.filter(v => minhasVagasIds.has(String(v.id)));
    }
    
    return vagasAbertas;
  }, [vagas, filtroVagaEscopo, minhasVagasIds]);

  // 🆕 v57.7: Candidatos filtrados - lógica SEPARADA para "Meus" vs "Todos"
  const candidatosFiltrados = useMemo(() => {
    // =============================================
    // MODO "MEUS": Busca direta do banco
    // =============================================
    if (filtroPessoaEscopo === 'minhas') {
      let filtered = meusCandidatos;
      
      // Filtro por texto de busca (nome, email, título)
      if (buscaTexto.trim()) {
        const termo = buscaTexto.toLowerCase();
        filtered = filtered.filter(c => 
          c.nome?.toLowerCase().includes(termo) ||
          c.email?.toLowerCase().includes(termo) ||
          c.titulo_profissional?.toLowerCase().includes(termo)
        );
      }
      
      return filtered;
    }
    
    // =============================================
    // MODO "TODOS": Busca por match de skills
    // =============================================
    let filtered = matches;
    
    // Filtro por texto de busca
    if (buscaTexto.trim()) {
      const termo = buscaTexto.toLowerCase();
      filtered = filtered.filter(m => 
        m.nome.toLowerCase().includes(termo) ||
        m.titulo_profissional?.toLowerCase().includes(termo) ||
        m.email?.toLowerCase().includes(termo)
      );
    }
    
    return filtered;
  }, [filtroPessoaEscopo, meusCandidatos, matches, buscaTexto]);

  // Paginação
  const totalPaginas = Math.ceil(candidatosFiltrados.length / ITEMS_PER_PAGE);
  const candidatosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITEMS_PER_PAGE;
    return candidatosFiltrados.slice(inicio, inicio + ITEMS_PER_PAGE);
  }, [candidatosFiltrados, paginaAtual]);

  // ============================================
  // EFFECTS
  // ============================================

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
  }, [isOpen, setMatches]);

  // Reset página ao mudar filtros
  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroPessoaEscopo, buscaTexto]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleFechar = () => {
    onClose();
  };

  // Buscar candidatos por match (só para modo "Todos")
  const handleBuscarCandidatos = async () => {
    if (vagaSelecionada && filtroPessoaEscopo === 'todas') {
      setBuscaBancoRealizada(false);
      setPaginaAtual(1);
      await buscarParaVaga(vagaSelecionada);
      setBuscaBancoRealizada(true);
    }
  };

  // Selecionar candidato
  const handleSelecionarCandidato = (candidato: any) => {
    setCandidatoSelecionado(candidato);
    setMostrarFormIndicacao(true);
  };

  // Criar candidatura
  const handleCriarCandidatura = async () => {
    if (!candidatoSelecionado || !vagaSelecionada) return;
    
    const pessoaId = candidatoSelecionado.pessoa_id || candidatoSelecionado.id;
    setCriandoCandidatura(pessoaId);
    
    try {
      const dadosIndicacao = origem === 'indicacao_cliente' ? {
        origem: 'indicacao_cliente' as const,
        indicado_por_nome: indicadoPorNome || undefined,
        indicado_por_cargo: indicadoPorCargo || undefined,
        indicacao_observacoes: indicacaoObservacoes || undefined,
        status_inicial: 'enviado_cliente'
      } : {
        origem: 'aquisicao' as const,
        status_inicial: 'enviado_cliente'
      };

      const candidatura = await criarCandidaturaComStatusEnviado(
        pessoaId,
        vagaSelecionada.id,
        currentUserId,
        dadosIndicacao
      );
      
      if (candidatura) {
        const tipoMsg = origem === 'indicacao_cliente' ? '(Indicação)' : '(Aquisição)';
        alert(`✅ Candidatura criada com sucesso! ${tipoMsg}\nStatus: Enviado ao Cliente`);
        
        if (onCandidaturaCriada) {
          onCandidaturaCriada(candidatura.id);
        }
        handleFechar();
      }
    } catch (err) {
      console.error('Erro ao criar candidatura:', err);
      alert('❌ Erro ao criar candidatura. Tente novamente.');
    } finally {
      setCriandoCandidatura(null);
    }
  };

  // ============================================
  // RENDER - Verificação se modal está fechado
  // ============================================
  
  if (!isOpen) return null;

  // ============================================
  // RENDER - Formulário de Indicação
  // ============================================
  
  if (mostrarFormIndicacao && candidatoSelecionado) {
    const nomeCandidate = candidatoSelecionado.nome;
    const tituloCandidate = candidatoSelecionado.titulo_profissional || 'Não informado';
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Confirmar Candidatura
              </h2>
              <button onClick={() => setMostrarFormIndicacao(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Conteúdo */}
          <div className="p-5 space-y-4">
            {/* Info do Candidato */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                  <User className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{nomeCandidate}</h3>
                  <p className="text-sm text-gray-500">{tituloCandidate}</p>
                </div>
              </div>
            </div>
            
            {/* Vaga */}
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-blue-800">
                <Briefcase className="w-5 h-5" />
                <span className="font-medium">{vagaSelecionada?.titulo}</span>
              </div>
            </div>
            
            {/* Tipo de Origem */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Origem da Candidatura
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setOrigem('aquisicao')}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 transition ${
                    origem === 'aquisicao'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Award className="w-5 h-5 mx-auto mb-1" />
                  <span className="text-sm font-medium">Aquisição</span>
                </button>
                <button
                  onClick={() => setOrigem('indicacao_cliente')}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 transition ${
                    origem === 'indicacao_cliente'
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Building2 className="w-5 h-5 mx-auto mb-1" />
                  <span className="text-sm font-medium">Indicação</span>
                </button>
              </div>
            </div>
            
            {/* Campos de Indicação */}
            {origem === 'indicacao_cliente' && (
              <div className="space-y-3 pt-2">
                <input
                  type="text"
                  placeholder="Nome de quem indicou"
                  value={indicadoPorNome}
                  onChange={e => setIndicadoPorNome(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
                <input
                  type="text"
                  placeholder="Cargo de quem indicou"
                  value={indicadoPorCargo}
                  onChange={e => setIndicadoPorCargo(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
                <textarea
                  placeholder="Observações da indicação..."
                  value={indicacaoObservacoes}
                  onChange={e => setIndicacaoObservacoes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="bg-gray-50 px-5 py-4 flex justify-end gap-3">
            <button
              onClick={() => setMostrarFormIndicacao(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Voltar
            </button>
            <button
              onClick={handleCriarCandidatura}
              disabled={criandoCandidatura !== null}
              className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
            >
              {criandoCandidatura !== null ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Criar Candidatura
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER - Modal Principal
  // ============================================
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* ============================================ */}
        {/* HEADER */}
        {/* ============================================ */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Nova Candidatura
            </h2>
            <button onClick={handleFechar} className="text-white/80 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-white/80 text-sm mt-1">
            Selecione uma vaga e um candidato para criar a candidatura
          </p>
        </div>

        {/* ============================================ */}
        {/* CONTEÚDO */}
        {/* ============================================ */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* ============================================ */}
          {/* SELEÇÃO DE VAGA */}
          {/* ============================================ */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <Briefcase className="w-5 h-5 text-orange-500" />
              <span className="font-semibold text-gray-700">1. Selecione a Vaga</span>
              
              {/* Toggle Minhas/Todas Vagas */}
              <div className="flex rounded-lg overflow-hidden border border-gray-300 ml-auto">
                <button
                  onClick={() => setFiltroVagaEscopo('minhas')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    filtroVagaEscopo === 'minhas'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Minhas Vagas
                </button>
                <button
                  onClick={() => setFiltroVagaEscopo('todas')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    filtroVagaEscopo === 'todas'
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Todas
                </button>
              </div>
            </div>
            
            <select
              value={vagaSelecionadaId}
              onChange={e => setVagaSelecionadaId(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 bg-white"
            >
              <option value="">-- Selecione uma vaga --</option>
              {vagasFiltradas.map(v => (
                <option key={v.id} value={String(v.id)}>
                  {v.titulo}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1 ml-1">
              {vagasFiltradas.length} vaga(s) {filtroVagaEscopo === 'minhas' ? 'associada(s) a você' : 'disponíveis'}
              {loadingMinhasVagas && ' (carregando...)'}
            </p>
          </div>

          {/* ============================================ */}
          {/* SELEÇÃO DE CANDIDATO */}
          {/* ============================================ */}
          {vagaSelecionadaId && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <User className="w-5 h-5 text-blue-500" />
                <span className="font-semibold text-gray-700">2. Selecione o Candidato</span>
                
                {/* Toggle Meus/Todos Candidatos */}
                <div className="flex rounded-lg overflow-hidden border border-gray-300 ml-auto">
                  <button
                    onClick={() => setFiltroPessoaEscopo('minhas')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      filtroPessoaEscopo === 'minhas'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Meus Candidatos
                  </button>
                  <button
                    onClick={() => setFiltroPessoaEscopo('todas')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      filtroPessoaEscopo === 'todas'
                        ? 'bg-orange-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Buscar Todos
                  </button>
                </div>
              </div>

              {/* Campo de Busca */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="🔍 Buscar por nome do candidato..."
                  value={buscaTexto}
                  onChange={e => setBuscaTexto(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Botão Buscar (só para "Todos") */}
              {filtroPessoaEscopo === 'todas' && (
                <div className="mb-4">
                  <button
                    onClick={handleBuscarCandidatos}
                    disabled={loadingMatches}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-5 py-2.5 rounded-xl hover:shadow-lg disabled:opacity-50 transition font-medium"
                  >
                    {loadingMatches ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Buscando candidatos compatíveis...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Buscar por Match de Skills
                      </>
                    )}
                  </button>
                  <p className="text-xs text-gray-400 mt-1 text-center">
                    Busca candidatos com skills compatíveis com a vaga
                  </p>
                </div>
              )}

              {/* Loading */}
              {(loadingMeusCandidatos || loadingMatches) && (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
                  <p className="text-gray-500 mt-2">Carregando candidatos...</p>
                </div>
              )}

              {/* ============================================ */}
              {/* LISTA DE CANDIDATOS */}
              {/* ============================================ */}
              {!loadingMeusCandidatos && !loadingMatches && (
                <>
                  {/* Mensagem quando não há candidatos */}
                  {candidatosFiltrados.length === 0 && (
                    <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300">
                      <User className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      {filtroPessoaEscopo === 'minhas' ? (
                        <>
                          <p className="text-gray-500 font-medium">Nenhum candidato encontrado</p>
                          <p className="text-sm text-gray-400 mt-1">
                            {buscaTexto 
                              ? `Nenhum candidato com "${buscaTexto}" no nome`
                              : 'Você não tem candidatos associados ainda'}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-gray-500 font-medium">
                            {buscaBancoRealizada ? 'Nenhum candidato compatível' : 'Clique em "Buscar" para encontrar candidatos'}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Cards de Candidatos */}
                  {candidatosFiltrados.length > 0 && (
                    <>
                      {/* Info de resultados */}
                      <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                        <span>
                          {candidatosFiltrados.length} candidato(s) {filtroPessoaEscopo === 'minhas' ? 'sob sua responsabilidade' : 'encontrado(s)'}
                        </span>
                        {totalPaginas > 1 && (
                          <span>Página {paginaAtual} de {totalPaginas}</span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {candidatosPaginados.map((candidato: any) => {
                          const id = candidato.pessoa_id || candidato.id;
                          const nome = candidato.nome || 'Sem nome';
                          const titulo = candidato.titulo_profissional || 'Não informado';
                          const senioridade = candidato.senioridade || 'N/I';
                          const disponibilidade = candidato.disponibilidade || 'N/I';
                          const cidade = candidato.cidade;
                          const estado = candidato.estado;
                          const skills = candidato.total_skills || candidato.skills_match?.length || 0;
                          const score = candidato.score_total;
                          
                          return (
                            <div
                              key={id}
                              onClick={() => handleSelecionarCandidato(candidato)}
                              className="bg-white border-2 border-gray-100 rounded-xl p-4 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all"
                            >
                              <div className="flex items-center gap-4">
                                {/* Avatar */}
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                  {nome.charAt(0).toUpperCase()}
                                </div>
                                
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-gray-800 truncate">
                                    {nome}
                                  </h4>
                                  <p className="text-sm text-gray-500 truncate">
                                    {titulo}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                    <span className="flex items-center gap-1">
                                      <Star className="w-3 h-3" />
                                      {senioridade}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {disponibilidade}
                                    </span>
                                    {cidade && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        {cidade}/{estado}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Info adicional */}
                                <div className="text-right flex-shrink-0">
                                  {filtroPessoaEscopo === 'minhas' ? (
                                    <div className="text-xs text-gray-500">
                                      {skills} skill(s)
                                    </div>
                                  ) : (
                                    <div className={`text-lg font-bold ${
                                      score >= 70 ? 'text-green-600' :
                                      score >= 40 ? 'text-yellow-600' : 'text-gray-400'
                                    }`}>
                                      {score}%
                                    </div>
                                  )}
                                  <button className="text-xs text-blue-600 hover:text-blue-800 mt-1">
                                    Selecionar →
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Paginação */}
                      {totalPaginas > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-4">
                          <button
                            onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                            disabled={paginaAtual === 1}
                            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-sm text-gray-600">
                            {paginaAtual} / {totalPaginas}
                          </span>
                          <button
                            onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                            disabled={paginaAtual === totalPaginas}
                            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Mensagem se não selecionou vaga */}
          {!vagaSelecionadaId && (
            <div className="text-center py-10 bg-gray-50 rounded-xl">
              <Search className="w-14 h-14 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-base font-medium">Selecione uma Vaga</p>
              <p className="text-sm text-gray-400 mt-1">
                Escolha uma vaga acima para selecionar candidatos
              </p>
            </div>
          )}
        </div>

        {/* ============================================ */}
        {/* FOOTER */}
        {/* ============================================ */}
        <div className="bg-gray-50 px-5 py-3 flex justify-between items-center border-t">
          <p className="text-xs text-gray-500">
            💡 Candidaturas são criadas com status <strong>"Enviado ao Cliente"</strong>
          </p>
          <button
            onClick={handleFechar}
            className="px-5 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default NovaCandidaturaModal;
