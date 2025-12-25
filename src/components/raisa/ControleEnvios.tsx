/**
 * ControleEnvios.tsx - RMS RAISA v2.0
 * Componente de Controle de Envios de CVs
 * 
 * INTEGRAÇÃO SUPABASE v2.0:
 * - Usa useRaisaEnvios hook (Supabase real)
 * - Tabelas: candidatura_envios, candidatura_aprovacoes
 * 
 * Data: 25/12/2024
 */

import React, { useState, useEffect, useMemo } from 'react';
import { User } from '@/types';
import { useRaisaEnvios, EnvioEnriquecido } from '../../hooks/supabase/useRaisaEnvios';

interface ControleEnviosProps {
  currentUser: User;
}

const ControleEnvios: React.FC<ControleEnviosProps> = ({ currentUser }) => {
  // Hook Supabase
  const {
    envios,
    metricas,
    loading,
    error,
    loadEnvios,
    registrarAprovacao,
    marcarComoVisualizado
  } = useRaisaEnvios();

  // Estados de filtro
  const [filtros, setFiltros] = useState({
    status: '',
    data_inicio: '',
    data_fim: ''
  });

  // Estado do modal de aprovação
  const [modalAprovacao, setModalAprovacao] = useState<{
    envio: EnvioEnriquecido | null;
    decisao: 'aprovado' | 'reprovado' | '';
    motivo: string;
    categoria: string;
    feedback: string;
  }>({
    envio: null,
    decisao: '',
    motivo: '',
    categoria: '',
    feedback: ''
  });

  // Carregar dados ao montar
  useEffect(() => {
    loadEnvios();
  }, []);

  // Aplicar filtros
  const handleAplicarFiltros = async () => {
    await loadEnvios({
      status: filtros.status || undefined,
      data_inicio: filtros.data_inicio || undefined,
      data_fim: filtros.data_fim || undefined
    });
  };

  // Limpar filtros
  const handleLimparFiltros = async () => {
    setFiltros({ status: '', data_inicio: '', data_fim: '' });
    await loadEnvios();
  };

  // Abrir modal de aprovação
  const handleAbrirModalAprovacao = (envio: EnvioEnriquecido, decisao: 'aprovado' | 'reprovado') => {
    setModalAprovacao({
      envio,
      decisao,
      motivo: '',
      categoria: '',
      feedback: ''
    });
  };

  // Fechar modal
  const handleFecharModal = () => {
    setModalAprovacao({
      envio: null,
      decisao: '',
      motivo: '',
      categoria: '',
      feedback: ''
    });
  };

  // Confirmar aprovação/reprovação
  const handleConfirmarAprovacao = async () => {
    if (!modalAprovacao.envio || !modalAprovacao.decisao) return;

    const envio = modalAprovacao.envio;
    
    const resultado = await registrarAprovacao({
      candidatura_id: envio.candidatura_id,
      candidatura_envio_id: envio.id,
      vaga_id: envio.vaga_id,
      cliente_id: envio.cliente_id,
      analista_id: envio.analista_id,
      decisao: modalAprovacao.decisao,
      decidido_por: currentUser.nome_usuario,
      motivo_reprovacao: modalAprovacao.decisao === 'reprovado' ? modalAprovacao.motivo : undefined,
      categoria_reprovacao: modalAprovacao.decisao === 'reprovado' ? modalAprovacao.categoria as any : undefined,
      feedback_cliente: modalAprovacao.feedback || undefined
    });

    if (resultado) {
      handleFecharModal();
    }
  };

  // Marcar como visualizado
  const handleMarcarVisualizado = async (envioId: number) => {
    await marcarComoVisualizado(envioId);
  };

  // Cores de status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enviado': return 'bg-yellow-100 text-yellow-800';
      case 'visualizado': return 'bg-blue-100 text-blue-800';
      case 'em_analise': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Cores de meio de envio
  const getMeioColor = (meio: string) => {
    switch (meio) {
      case 'email': return 'bg-blue-100 text-blue-800';
      case 'portal_cliente': return 'bg-green-100 text-green-800';
      case 'whatsapp': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          📤 Controle de Envios
        </h1>
        <p className="text-gray-600 mt-1">
          Acompanhe envios e aprovações de CVs • Integrado com Supabase
        </p>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">❌ {error}</p>
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
          <div className="text-3xl font-bold text-blue-600">{metricas.total_envios}</div>
          <div className="text-sm text-gray-600">CVs Enviados</div>
        </div>
        <div className="bg-cyan-50 rounded-lg p-4 border-l-4 border-cyan-500">
          <div className="text-3xl font-bold text-cyan-600">{metricas.total_visualizados}</div>
          <div className="text-sm text-gray-600">Visualizados</div>
          <div className="text-xs text-cyan-600 mt-1">{metricas.taxa_visualizacao}% taxa</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
          <div className="text-3xl font-bold text-green-600">{metricas.total_aprovados}</div>
          <div className="text-sm text-gray-600">Aprovados</div>
          <div className="text-xs text-green-600 mt-1">{metricas.taxa_aprovacao}% taxa</div>
        </div>
        <div className="bg-red-50 rounded-lg p-4 border-l-4 border-red-500">
          <div className="text-3xl font-bold text-red-600">{metricas.total_reprovados}</div>
          <div className="text-sm text-gray-600">Reprovados</div>
        </div>
      </div>

      {/* Métricas Secundárias */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-500">
          <div className="text-2xl font-bold text-orange-600">{metricas.total_aguardando}</div>
          <div className="text-sm text-gray-600">Aguardando Resposta</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-500">
          <div className="text-2xl font-bold text-purple-600">
            {metricas.tempo_medio_resposta_dias} dias
          </div>
          <div className="text-sm text-gray-600">Tempo Médio de Resposta</div>
        </div>
        <div className="bg-indigo-50 rounded-lg p-4 border-l-4 border-indigo-500">
          <div className="text-2xl font-bold text-indigo-600">
            {metricas.total_envios > 0 
              ? Math.round((metricas.total_aprovados / metricas.total_envios) * 100) 
              : 0}%
          </div>
          <div className="text-sm text-gray-600">Taxa de Conversão</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filtros.status}
              onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Todos</option>
              <option value="enviado">Enviado</option>
              <option value="visualizado">Visualizado</option>
              <option value="em_analise">Em Análise</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
            <input
              type="date"
              value={filtros.data_inicio}
              onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
            <input
              type="date"
              value={filtros.data_fim}
              onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleAplicarFiltros}
              className="flex-1 bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700"
            >
              Filtrar
            </button>
            <button
              onClick={handleLimparFiltros}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      {/* Tabela de Envios */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Carregando envios...</p>
          </div>
        ) : envios.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Nenhum envio encontrado.</p>
            <p className="text-sm text-gray-400 mt-1">
              Os envios aparecerão aqui quando forem registrados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Candidato
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vaga
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Enviado Em
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Meio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {envios.map((envio) => (
                  <tr key={envio.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{envio.candidato_nome}</div>
                      <div className="text-sm text-gray-500">{envio.candidato_email}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {envio.vaga_titulo}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {envio.cliente_nome}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(envio.enviado_em).toLocaleDateString('pt-BR')}
                      <div className="text-xs text-gray-400">
                        {new Date(envio.enviado_em).toLocaleTimeString('pt-BR', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${getMeioColor(envio.meio_envio)}`}>
                        {envio.meio_envio.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${getStatusColor(envio.status)}`}>
                        {envio.status.replace('_', ' ')}
                      </span>
                      {envio.visualizado_em && (
                        <div className="text-xs text-gray-400 mt-1">
                          Visto: {new Date(envio.visualizado_em).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {envio.status === 'enviado' && (
                          <button
                            onClick={() => handleMarcarVisualizado(envio.id)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                            title="Marcar como visualizado"
                          >
                            👁️
                          </button>
                        )}
                        <button
                          onClick={() => handleAbrirModalAprovacao(envio, 'aprovado')}
                          className="text-green-600 hover:text-green-800 text-sm"
                          title="Registrar Aprovação"
                        >
                          ✅
                        </button>
                        <button
                          onClick={() => handleAbrirModalAprovacao(envio, 'reprovado')}
                          className="text-red-600 hover:text-red-800 text-sm"
                          title="Registrar Reprovação"
                        >
                          ❌
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Contador */}
      <div className="text-sm text-gray-500 text-right">
        {envios.length} envio(s) encontrado(s)
      </div>

      {/* Modal de Aprovação/Reprovação */}
      {modalAprovacao.envio && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className={`p-4 rounded-t-lg ${
              modalAprovacao.decisao === 'aprovado' 
                ? 'bg-green-600 text-white' 
                : 'bg-red-600 text-white'
            }`}>
              <h3 className="text-lg font-bold">
                {modalAprovacao.decisao === 'aprovado' ? '✅ Registrar Aprovação' : '❌ Registrar Reprovação'}
              </h3>
              <p className="text-sm opacity-90">
                {modalAprovacao.envio.candidato_nome} - {modalAprovacao.envio.vaga_titulo}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {modalAprovacao.decisao === 'reprovado' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Categoria da Reprovação *
                    </label>
                    <select
                      value={modalAprovacao.categoria}
                      onChange={e => setModalAprovacao({...modalAprovacao, categoria: e.target.value})}
                      className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">Selecione...</option>
                      <option value="tecnico">Técnico</option>
                      <option value="comportamental">Comportamental</option>
                      <option value="salario">Pretensão Salarial</option>
                      <option value="disponibilidade">Disponibilidade</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Motivo da Reprovação *
                    </label>
                    <textarea
                      value={modalAprovacao.motivo}
                      onChange={e => setModalAprovacao({...modalAprovacao, motivo: e.target.value})}
                      placeholder="Descreva o motivo da reprovação..."
                      className="w-full border border-gray-300 rounded px-3 py-2 h-24 focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Feedback do Cliente (opcional)
                </label>
                <textarea
                  value={modalAprovacao.feedback}
                  onChange={e => setModalAprovacao({...modalAprovacao, feedback: e.target.value})}
                  placeholder="Comentários ou observações do cliente..."
                  className="w-full border border-gray-300 rounded px-3 py-2 h-20 focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t bg-gray-50 rounded-b-lg">
              <button
                onClick={handleFecharModal}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarAprovacao}
                disabled={modalAprovacao.decisao === 'reprovado' && (!modalAprovacao.motivo || !modalAprovacao.categoria)}
                className={`px-6 py-2 rounded text-white font-medium disabled:opacity-50 ${
                  modalAprovacao.decisao === 'aprovado'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                Confirmar {modalAprovacao.decisao === 'aprovado' ? 'Aprovação' : 'Reprovação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControleEnvios;
