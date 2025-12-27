/**
 * PosicaoComercial.tsx - Dashboard de Posição Comercial
 * 
 * Funcionalidades:
 * - Tabela de vagas com envios por semana
 * - Filtro por Gestor Comercial
 * - Filtro por Cliente
 * - Filtro por Faturável
 * - Ordenação por Status
 * - Totais por coluna
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  usePosicaoComercial, 
  PosicaoComercialItem,
  FiltrosPosicao,
  TotaisPosicao
} from '../hooks/Supabase/usePosicaoComercial';

// ============================================
// FORMATADORES
// ============================================

const formatarData = (data: string): string => {
  if (!data) return '-';
  return new Date(data).toLocaleDateString('pt-BR');
};

// ============================================
// CORES POR STATUS
// ============================================

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'CANCELADA':
      return 'bg-gray-500 text-white';
    case 'PERDIDA':
      return 'bg-red-600 text-white';
    case 'APROVADA':
      return 'bg-green-600 text-white';
    case 'EM ANDAMENTO':
      return 'bg-yellow-500 text-white';
    case 'ABERTA':
      return 'bg-blue-600 text-white';
    default:
      return 'bg-gray-400 text-white';
  }
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const PosicaoComercial: React.FC = () => {
  const {
    loading,
    posicoes,
    gestoresComerciais,
    clientes,
    buscarPosicaoComercial,
    buscarGestoresComerciais,
    buscarClientes,
    calcularTotais,
    getMesCorrente,
    getMesAnterior
  } = usePosicaoComercial();

  // Estados dos filtros
  const [filtros, setFiltros] = useState<FiltrosPosicao>({
    gestorComercialId: null,
    clienteId: null,
    faturavel: null
  });

  // Estados dos dados
  const [dadosPosicao, setDadosPosicao] = useState<PosicaoComercialItem[]>([]);
  const [totais, setTotais] = useState<TotaisPosicao>({
    totalVagas: 0,
    totalEnviados: 0,
    totalReprovados: 0,
    totalAguardando: 0,
    enviadosSemana1: 0,
    enviadosSemana2: 0,
    enviadosSemana3: 0,
    enviadosSemana4: 0,
    enviadosSemana5: 0
  });

  // Info do mês
  const mesCorrente = getMesCorrente();
  const mesAnterior = getMesAnterior();

  // ============================================
  // CARREGAR DADOS
  // ============================================

  useEffect(() => {
    carregarInicial();
  }, []);

  useEffect(() => {
    carregarPosicao();
  }, [filtros]);

  const carregarInicial = async () => {
    await Promise.all([
      buscarGestoresComerciais(),
      buscarClientes()
    ]);
    await carregarPosicao();
  };

  const carregarPosicao = async () => {
    const dados = await buscarPosicaoComercial(filtros);
    setDadosPosicao(dados);
    setTotais(calcularTotais(dados));
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleFiltroGestor = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const valor = e.target.value;
    setFiltros(f => ({
      ...f,
      gestorComercialId: valor ? parseInt(valor) : null
    }));
  };

  const handleFiltroCliente = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const valor = e.target.value;
    setFiltros(f => ({
      ...f,
      clienteId: valor ? parseInt(valor) : null
    }));
  };

  const handleFiltroFaturavel = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const valor = e.target.value;
    setFiltros(f => ({
      ...f,
      faturavel: valor === '' ? null : valor === 'true'
    }));
  };

  // Clientes filtrados por gestor selecionado
  const clientesFiltrados = useMemo(() => {
    if (!filtros.gestorComercialId) return clientes;
    return clientes.filter(c => c.id_gestao_comercial === filtros.gestorComercialId);
  }, [clientes, filtros.gestorComercialId]);

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">📊 Posição Comercial</h1>
              <p className="text-sm text-gray-500">
                CVs enviados em <strong>{mesCorrente.mes} {mesCorrente.ano}</strong>
              </p>
            </div>
            
            {/* Filtros */}
            <div className="flex flex-wrap gap-3">
              {/* Gestor Comercial */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">Gestor:</label>
                <select
                  value={filtros.gestorComercialId || ''}
                  onChange={handleFiltroGestor}
                  className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-w-[150px]"
                >
                  <option value="">Todos</option>
                  {gestoresComerciais.map(g => (
                    <option key={g.id} value={g.id}>{g.nome_usuario}</option>
                  ))}
                </select>
              </div>

              {/* Cliente */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">Cliente:</label>
                <select
                  value={filtros.clienteId || ''}
                  onChange={handleFiltroCliente}
                  className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-w-[150px]"
                >
                  <option value="">Todos</option>
                  {clientesFiltrados.map(c => (
                    <option key={c.id} value={c.id}>{c.razao_social_cliente}</option>
                  ))}
                </select>
              </div>

              {/* Faturável */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">Faturável:</label>
                <select
                  value={filtros.faturavel === null ? '' : String(filtros.faturavel)}
                  onChange={handleFiltroFaturavel}
                  className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-w-[130px]"
                >
                  <option value="">Todos</option>
                  <option value="true">Faturável</option>
                  <option value="false">Não Faturável</option>
                </select>
              </div>

              {/* Botão Atualizar */}
              <button
                onClick={carregarPosicao}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <span className="animate-spin">⚙️</span> : <span>🔄</span>}
                Atualizar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-6">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-500">Carregando...</span>
          </div>
        )}

        {/* Tabela */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {/* Header principal */}
                <tr className="bg-gray-800 text-white">
                  <th className="px-3 py-3 text-left font-semibold" rowSpan={2}>CLIENTE</th>
                  <th className="px-3 py-3 text-left font-semibold" rowSpan={2}>VAGA</th>
                  <th className="px-3 py-3 text-center font-semibold" rowSpan={2}>Qtde</th>
                  <th className="px-3 py-3 text-center font-semibold" rowSpan={2}>OC</th>
                  <th className="px-3 py-3 text-center font-semibold" rowSpan={2}>Abertura</th>
                  <th className="px-3 py-3 text-center font-semibold bg-gray-700" rowSpan={2}>
                    Enviados<br/>
                    <span className="text-xs font-normal text-gray-300">{mesAnterior.mes}</span>
                  </th>
                  <th className="px-3 py-3 text-center font-semibold bg-blue-700" colSpan={5}>
                    CVs enviados em {mesCorrente.mes}
                  </th>
                  <th className="px-3 py-3 text-center font-semibold bg-green-700" colSpan={3}>
                    Total
                  </th>
                  <th className="px-3 py-3 text-center font-semibold" rowSpan={2}>STATUS</th>
                </tr>
                <tr className="bg-gray-700 text-white">
                  <th className="px-2 py-2 text-center text-xs bg-blue-600">Sem 1</th>
                  <th className="px-2 py-2 text-center text-xs bg-blue-600">Sem 2</th>
                  <th className="px-2 py-2 text-center text-xs bg-blue-600">Sem 3</th>
                  <th className="px-2 py-2 text-center text-xs bg-blue-600">Sem 4</th>
                  <th className="px-2 py-2 text-center text-xs bg-blue-600">Sem 5</th>
                  <th className="px-2 py-2 text-center text-xs bg-green-600">Enviados</th>
                  <th className="px-2 py-2 text-center text-xs bg-red-600">Reprov.</th>
                  <th className="px-2 py-2 text-center text-xs bg-yellow-600">Aguard.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dadosPosicao.length > 0 ? (
                  dadosPosicao.map((item, idx) => (
                    <tr key={item.vaga_id || idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[150px] truncate">
                        {item.razao_social_cliente}
                      </td>
                      <td className="px-3 py-2 text-gray-600 max-w-[250px]">
                        <div className="truncate" title={item.titulo}>
                          {item.titulo}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">
                        {item.quantidade}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">
                        {item.ocorrencia || '-'}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600 text-xs">
                        {formatarData(item.data_abertura)}
                      </td>
                      <td className="px-3 py-2 text-center bg-gray-50 font-medium">
                        {item.enviados_mes_anterior || '-'}
                      </td>
                      <td className="px-3 py-2 text-center bg-blue-50">
                        {item.enviados_semana1 || '-'}
                      </td>
                      <td className="px-3 py-2 text-center bg-blue-50">
                        {item.enviados_semana2 || '-'}
                      </td>
                      <td className="px-3 py-2 text-center bg-blue-50">
                        {item.enviados_semana3 || '-'}
                      </td>
                      <td className="px-3 py-2 text-center bg-blue-50">
                        {item.enviados_semana4 || '-'}
                      </td>
                      <td className="px-3 py-2 text-center bg-blue-50">
                        {item.enviados_semana5 || '-'}
                      </td>
                      <td className="px-3 py-2 text-center bg-green-50 font-medium">
                        {item.total_enviados}
                      </td>
                      <td className="px-3 py-2 text-center bg-red-50">
                        {item.total_reprovados || '-'}
                      </td>
                      <td className="px-3 py-2 text-center bg-yellow-50">
                        {item.total_aguardando}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${getStatusColor(item.status_label)}`}>
                          {item.status_label}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={15} className="px-4 py-12 text-center text-gray-400">
                      <span className="text-4xl">📭</span>
                      <p className="mt-2">Nenhuma vaga encontrada</p>
                      <p className="text-sm">Ajuste os filtros ou aguarde o carregamento</p>
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Footer com totais */}
              {dadosPosicao.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-100 font-bold text-gray-800">
                    <td className="px-3 py-3" colSpan={5}>
                      TOTAL ({totais.totalVagas} vagas)
                    </td>
                    <td className="px-3 py-3 text-center bg-gray-200">
                      {dadosPosicao.reduce((sum, i) => sum + i.enviados_mes_anterior, 0)}
                    </td>
                    <td className="px-3 py-3 text-center bg-blue-100">
                      {totais.enviadosSemana1}
                    </td>
                    <td className="px-3 py-3 text-center bg-blue-100">
                      {totais.enviadosSemana2}
                    </td>
                    <td className="px-3 py-3 text-center bg-blue-100">
                      {totais.enviadosSemana3}
                    </td>
                    <td className="px-3 py-3 text-center bg-blue-100">
                      {totais.enviadosSemana4}
                    </td>
                    <td className="px-3 py-3 text-center bg-blue-100">
                      {totais.enviadosSemana5}
                    </td>
                    <td className="px-3 py-3 text-center bg-green-100 text-green-700">
                      {totais.totalEnviados}
                    </td>
                    <td className="px-3 py-3 text-center bg-red-100 text-red-700">
                      {totais.totalReprovados}
                    </td>
                    <td className="px-3 py-3 text-center bg-yellow-100 text-yellow-700">
                      {totais.totalAguardando}
                    </td>
                    <td className="px-3 py-3 text-center">-</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Legenda de Status */}
        <div className="mt-6 bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-3">📋 Legenda de Status (Ordem de Exibição)</h3>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'CANCELADA', ordem: 1 },
              { label: 'PERDIDA', ordem: 2 },
              { label: 'APROVADA', ordem: 3 },
              { label: 'EM ANDAMENTO', ordem: 4 },
              { label: 'ABERTA', ordem: 5 }
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{s.ordem})</span>
                <span className={`px-2 py-1 rounded text-xs font-bold ${getStatusColor(s.label)}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="mt-4 text-xs text-gray-400 text-center">
          💡 As semanas são calculadas automaticamente: Sem 1 (dias 1-7), Sem 2 (dias 8-14), Sem 3 (dias 15-21), Sem 4 (dias 22-28), Sem 5 (dias 29+)
        </div>
      </div>
    </div>
  );
};

export default PosicaoComercial;
