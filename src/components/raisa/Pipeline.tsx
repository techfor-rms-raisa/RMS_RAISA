/**
 * Pipeline.tsx - Pipeline de Vagas com Distribuição Inteligente
 * 
 * Funcionalidades:
 * - Visualização Kanban das vagas por status
 * - Botão de Distribuição Inteligente por vaga
 * - Indicador de analistas atribuídos
 * - Estatísticas de candidatos por analista
 * 
 * 🆕 v2.2: Alteração de Status
 *       - Removido: "Em Seleção" 
 *       - Adicionado: "Perdida" (entre Finalizada e Cancelada)
 * 
 * v2.1: Corrigido erro "column vagas.prioridade does not exist"
 *       - Substituído prioridade por urgente (boolean)
 *       - Substituído data_abertura por criado_em
 * 
 * Data: 21/01/2026
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import DistribuicaoVagasPanel from './DistribuicaoVagasPanel';

interface Vaga {
  id: number;
  titulo: string;
  status: string;
  cliente_id: number;
  cliente_nome?: string;
  urgente?: boolean;
  criado_em?: string;
  total_candidatos?: number;
  analistas_count?: number;
}

interface VagaComDistribuicao extends Vaga {
  analistas?: {
    id: number;
    nome: string;
    candidatos_atribuidos: number;
  }[];
}

interface PipelineProps {
  currentUserId?: number;
}

// 🆕 v2.2: Colunas do Pipeline ATUALIZADAS
// Removido: em_selecao | Adicionado: perdida
const COLUNAS_PIPELINE = [
  { status: 'aberta', titulo: '📂 Abertas', cor: 'bg-blue-500' },
  { status: 'em_andamento', titulo: '🔄 Em Andamento', cor: 'bg-yellow-500' },
  { status: 'finalizada', titulo: '✅ Finalizadas', cor: 'bg-green-500' },
  { status: 'perdida', titulo: '😔 Perdidas', cor: 'bg-orange-500' },
  { status: 'cancelada', titulo: '❌ Canceladas', cor: 'bg-red-500' }
];

const Pipeline: React.FC<PipelineProps> = ({ currentUserId }) => {
  // Estados
  const [vagas, setVagas] = useState<VagaComDistribuicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal de Distribuição
  const [showDistribuicao, setShowDistribuicao] = useState(false);
  const [vagaSelecionada, setVagaSelecionada] = useState<VagaComDistribuicao | null>(null);

  // Carregar vagas com dados de distribuição
  const carregarVagas = async () => {
    setLoading(true);
    try {
      // Buscar vagas
      const { data: vagasData, error: vagasError } = await supabase
        .from('vagas')
        .select(`
          id,
          titulo,
          status,
          cliente_id,
          urgente,
          criado_em,
          cliente:clients(razao_social_cliente)
        `)
        .order('criado_em', { ascending: false });

      if (vagasError) throw vagasError;

      // Para cada vaga, buscar distribuição e contagem de candidatos
      const vagasComDados = await Promise.all(
        (vagasData || []).map(async (vaga) => {
          // Contar candidatos
          const { count: totalCandidatos } = await supabase
            .from('candidaturas')
            .select('*', { count: 'exact', head: true })
            .eq('vaga_id', vaga.id);

          // Buscar analistas da distribuição
          const { data: distribuicao } = await supabase
            .from('vaga_analista_distribuicao')
            .select(`
              analista_id,
              candidatos_atribuidos,
              analista:app_users(nome_usuario)
            `)
            .eq('vaga_id', vaga.id)
            .eq('ativo', true);

          return {
            ...vaga,
            cliente_nome: vaga.cliente?.razao_social_cliente,
            total_candidatos: totalCandidatos || 0,
            analistas_count: distribuicao?.length || 0,
            analistas: (distribuicao || []).map(d => ({
              id: d.analista_id,
              nome: d.analista?.nome_usuario || '',
              candidatos_atribuidos: d.candidatos_atribuidos
            }))
          };
        })
      );

      setVagas(vagasComDados);
    } catch (err: any) {
      console.error('Erro ao carregar vagas:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarVagas();
  }, []);

  // Abrir modal de distribuição
  const handleAbrirDistribuicao = (vaga: VagaComDistribuicao) => {
    setVagaSelecionada(vaga);
    setShowDistribuicao(true);
  };

  // Fechar modal e recarregar
  const handleFecharDistribuicao = () => {
    setShowDistribuicao(false);
    setVagaSelecionada(null);
    carregarVagas(); // Recarregar para atualizar contadores
  };

  // Filtrar vagas por status
  const getVagasPorStatus = (status: string) => {
    return vagas.filter(v => v.status === status);
  };

  // Renderizar card de vaga
  const renderVagaCard = (vaga: VagaComDistribuicao) => (
    <div 
      key={vaga.id}
      className="bg-white rounded-lg shadow-sm border p-4 mb-3 hover:shadow-md transition-shadow"
    >
      {/* Título e Cliente */}
      <div className="mb-2">
        <h4 className="font-medium text-gray-800 text-sm line-clamp-2">{vaga.titulo}</h4>
        <p className="text-xs text-gray-500 mt-1">{vaga.cliente_nome || 'Sem cliente'}</p>
      </div>

      {/* Indicadores */}
      <div className="flex items-center justify-between text-xs text-gray-600 mb-3">
        <span className="flex items-center gap-1">
          👥 {vaga.total_candidatos} candidatos
        </span>
        {vaga.urgente && (
          <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded">
            🔥 Urgente
          </span>
        )}
      </div>

      {/* Analistas atribuídos */}
      {vaga.analistas && vaga.analistas.length > 0 && (
        <div className="mb-3 p-2 bg-gray-50 rounded text-xs">
          <p className="font-medium text-gray-700 mb-1">Analistas:</p>
          {vaga.analistas.map(a => (
            <div key={a.id} className="flex justify-between text-gray-600">
              <span>{a.nome}</span>
              <span className="text-indigo-600">{a.candidatos_atribuidos} CVs</span>
            </div>
          ))}
        </div>
      )}

      {/* Botão de Distribuição */}
      <button
        onClick={() => handleAbrirDistribuicao(vaga)}
        className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors ${
          vaga.analistas_count > 0 
            ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        {vaga.analistas_count > 0 ? '👥 Gerenciar Distribuição' : '+ Configurar Distribuição'}
      </button>
    </div>
  );

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-gray-500">Carregando pipeline...</p>
        </div>
      </div>
    );
  }

  // Erro
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
        <p className="font-medium">Erro ao carregar pipeline</p>
        <p className="text-sm">{error}</p>
        <button 
          onClick={carregarVagas}
          className="mt-2 text-sm underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Pipeline de Vagas</h2>
          <p className="text-sm text-gray-500">
            {vagas.length} vagas • {vagas.reduce((sum, v) => sum + (v.total_candidatos || 0), 0)} candidatos total
          </p>
        </div>
        <button
          onClick={carregarVagas}
          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
        >
          🔄 Atualizar
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUNAS_PIPELINE.map(coluna => {
          const vagasColuna = getVagasPorStatus(coluna.status);
          
          return (
            <div 
              key={coluna.status}
              className="flex-shrink-0 w-80"
            >
              {/* Header da coluna */}
              <div className={`${coluna.cor} text-white px-4 py-2 rounded-t-lg flex justify-between items-center`}>
                <span className="font-medium">{coluna.titulo}</span>
                <span className="bg-white/20 px-2 py-0.5 rounded text-sm">
                  {vagasColuna.length}
                </span>
              </div>

              {/* Cards */}
              <div className="bg-gray-100 rounded-b-lg p-3 min-h-[400px] max-h-[calc(100vh-300px)] overflow-y-auto">
                {vagasColuna.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    Nenhuma vaga
                  </div>
                ) : (
                  vagasColuna.map(vaga => renderVagaCard(vaga))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Distribuição */}
      {showDistribuicao && vagaSelecionada && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <DistribuicaoVagasPanel
              vagaId={vagaSelecionada.id}
              vagaTitulo={vagaSelecionada.titulo}
              clienteNome={vagaSelecionada.cliente_nome}
              onClose={handleFecharDistribuicao}
              currentUserId={currentUserId}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Pipeline;
