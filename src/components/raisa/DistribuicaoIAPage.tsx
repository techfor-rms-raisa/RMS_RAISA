/**
 * DistribuicaoIAPage.tsx - Página de Distribuição Inteligente com IA
 * 
 * Wrapper que permite:
 * - Selecionar uma vaga da lista de vagas em andamento
 * - Abrir o painel de distribuição IA para a vaga selecionada
 * - Voltar à lista para distribuir outra vaga
 * 
 * Versão: 1.0
 * Data: 09/01/2026
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import DistribuicaoIAPanel from './DistribuicaoIAPanel';
import { useAuth } from '@/contexts/AuthContext';

interface VagaParaDistribuir {
  id: number;
  titulo: string;
  status: string;
  status_posicao: string;
  cliente_nome: string;
  cliente_id: number;
  total_analistas: number;
  created_at: string;
}

interface Cliente {
  id: number;
  razao_social_cliente: string;
}

const DistribuicaoIAPage: React.FC = () => {
  const { user } = useAuth();
  const [vagas, setVagas] = useState<VagaParaDistribuir[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vagaSelecionada, setVagaSelecionada] = useState<VagaParaDistribuir | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>('pendentes');
  const [filtroCliente, setFiltroCliente] = useState<number | null>(null);

  // Carregar clientes ao montar
  useEffect(() => {
    carregarClientes();
  }, []);

  // Carregar vagas quando filtros mudarem
  useEffect(() => {
    carregarVagas();
  }, [filtroStatus, filtroCliente]);

  const carregarClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, razao_social_cliente')
        .eq('ativo_cliente', true)
        .order('razao_social_cliente');

      if (error) throw error;
      setClientes(data || []);
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
    }
  };

  const carregarVagas = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar vagas com contagem de analistas
      let query = supabase
        .from('vagas')
        .select(`
          id,
          titulo,
          status,
          status_posicao,
          created_at,
          cliente_id,
          clients!inner(id, razao_social_cliente)
        `)
        .order('created_at', { ascending: false });

      // Filtrar por status
      if (filtroStatus === 'pendentes') {
        query = query
          .in('status', ['aberta', 'em_andamento'])
          .or('status_posicao.is.null,status_posicao.eq.triagem');
      } else if (filtroStatus === 'em_andamento') {
        query = query.eq('status', 'em_andamento');
      } else if (filtroStatus === 'abertas') {
        query = query.eq('status', 'aberta');
      }

      // Filtrar por cliente
      if (filtroCliente) {
        query = query.eq('cliente_id', filtroCliente);
      }

      const { data: vagasData, error: vagasError } = await query;

      if (vagasError) throw vagasError;

      // Buscar contagem de analistas por vaga
      const vagasComContagem: VagaParaDistribuir[] = await Promise.all(
        (vagasData || []).map(async (vaga: any) => {
          const { count } = await supabase
            .from('vaga_analista_distribuicao')
            .select('*', { count: 'exact', head: true })
            .eq('vaga_id', vaga.id)
            .eq('ativo', true);

          return {
            id: vaga.id,
            titulo: vaga.titulo,
            status: vaga.status,
            status_posicao: vaga.status_posicao || 'triagem',
            cliente_nome: vaga.clients?.razao_social_cliente || 'Cliente não informado',
            cliente_id: vaga.cliente_id,
            total_analistas: count || 0,
            created_at: vaga.created_at
          };
        })
      );

      // Filtrar: "Pendentes" mostra apenas vagas SEM analistas atribuídos
      const vagasFiltradas = filtroStatus === 'pendentes'
        ? vagasComContagem.filter(v => v.total_analistas === 0)
        : vagasComContagem;

      setVagas(vagasFiltradas);
    } catch (err: any) {
      console.error('Erro ao carregar vagas:', err);
      setError(err.message || 'Erro ao carregar vagas');
    } finally {
      setLoading(false);
    }
  };

  const handleDistribuicaoConfirmada = () => {
    setVagaSelecionada(null);
    carregarVagas();
  };

  // Se uma vaga foi selecionada, mostrar o painel de distribuição
  if (vagaSelecionada) {
    return (
      <div className="p-6">
        <button
          onClick={() => setVagaSelecionada(null)}
          className="mb-4 flex items-center text-gray-600 hover:text-gray-800 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para lista de vagas
        </button>

        <DistribuicaoIAPanel
          vagaId={vagaSelecionada.id}
          vagaTitulo={vagaSelecionada.titulo}
          clienteNome={vagaSelecionada.cliente_nome}
          onClose={() => setVagaSelecionada(null)}
          onDistribuicaoConfirmada={handleDistribuicaoConfirmada}
          currentUserId={user?.id}
        />
      </div>
    );
  }

  // Tela de seleção de vaga
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <span className="text-3xl">🤖</span>
          Distribuição Inteligente com IA
        </h1>
        <p className="text-gray-600 mt-2">
          Selecione uma vaga para distribuir automaticamente aos analistas mais adequados
        </p>
      </div>

      {/* Filtros de Status */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <button
          onClick={() => setFiltroStatus('pendentes')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filtroStatus === 'pendentes'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          🎯 Pendentes de Distribuição
        </button>
        <button
          onClick={() => setFiltroStatus('abertas')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filtroStatus === 'abertas'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          📂 Abertas
        </button>
        <button
          onClick={() => setFiltroStatus('em_andamento')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filtroStatus === 'em_andamento'
              ? 'bg-yellow-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          🔄 Em Andamento
        </button>
        <button
          onClick={() => setFiltroStatus('todas')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filtroStatus === 'todas'
              ? 'bg-gray-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          📋 Todas
        </button>
      </div>

      {/* Filtro por Cliente */}
      <div className="mb-6 flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">
          🏢 Cliente:
        </label>
        <select
          value={filtroCliente || ''}
          onChange={(e) => setFiltroCliente(e.target.value ? Number(e.target.value) : null)}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-w-[250px]"
        >
          <option value="">Todos os Clientes</option>
          {clientes.map((cliente) => (
            <option key={cliente.id} value={cliente.id}>
              {cliente.razao_social_cliente}
            </option>
          ))}
        </select>
        
        {/* Contador de vagas */}
        <span className="text-sm text-gray-500 ml-4">
          {vagas.length} {vagas.length === 1 ? 'vaga' : 'vagas'} encontrada{vagas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          <span className="ml-4 text-gray-600">Carregando vagas...</span>
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Lista de Vagas */}
      {!loading && !error && (
        <div className="grid gap-4">
          {vagas.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <span className="text-4xl mb-4 block">📭</span>
              <p className="text-gray-600">Nenhuma vaga encontrada com este filtro</p>
            </div>
          ) : (
            vagas.map((vaga) => (
              <div
                key={vaga.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setVagaSelecionada(vaga)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800">{vaga.titulo}</h3>
                    <p className="text-gray-600 mt-1">{vaga.cliente_nome}</p>
                    
                    <div className="flex gap-3 mt-3">
                      {/* Status */}
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        vaga.status === 'aberta' ? 'bg-blue-100 text-blue-700' :
                        vaga.status === 'em_andamento' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {vaga.status === 'aberta' ? '📂 Aberta' :
                         vaga.status === 'em_andamento' ? '🔄 Em Andamento' :
                         vaga.status}
                      </span>
                      
                      {/* Analistas */}
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        vaga.total_analistas === 0 
                          ? 'bg-red-100 text-red-700' 
                          : 'bg-green-100 text-green-700'
                      }`}>
                        👥 {vaga.total_analistas} {vaga.total_analistas === 1 ? 'analista' : 'analistas'}
                      </span>

                      {/* Posição */}
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                        📍 {vaga.status_posicao}
                      </span>
                    </div>
                  </div>

                  {/* Botão distribuir */}
                  <button
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      vaga.total_analistas === 0
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {vaga.total_analistas === 0 ? '🤖 Distribuir' : '🔄 Redistribuir'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Legenda */}
      <div className="mt-8 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl">
        <h4 className="font-medium text-gray-700 mb-2">💡 Como funciona:</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>1. Selecione uma vaga da lista acima</li>
          <li>2. A IA analisará os perfis dos analistas e gerará um ranking</li>
          <li>3. Aceite a sugestão da IA ou escolha manualmente</li>
          <li>4. Se optar por override, informe o motivo para aprendizado contínuo</li>
        </ul>
      </div>
    </div>
  );
};

export default DistribuicaoIAPage;
