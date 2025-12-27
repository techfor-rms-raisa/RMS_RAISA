/**
 * MovimentacoesConsultores.tsx - Dashboard de Movimentações de Consultores
 * 
 * Funcionalidades:
 * - Tabs de meses (JAN-DEZ + ACUMULADO)
 * - Filtro por Gestor Comercial
 * - Tabela de Inclusões (Consultores Aprovados)
 * - Tabela de Exclusões (Consultores Perdidos/Encerrados)
 * - Totais e valores
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  useMovimentacoes, 
  InclusaoConsultor, 
  ExclusaoConsultor,
  TotaisMovimentacao,
  MESES 
} from '../hooks/Supabase/useMovimentacoes';

// ============================================
// FORMATADORES
// ============================================

const formatarMoeda = (valor: number): string => {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

const formatarData = (data: string): string => {
  if (!data) return '-';
  return new Date(data).toLocaleDateString('pt-BR');
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const MovimentacoesConsultores: React.FC = () => {
  const {
    loading,
    inclusoes,
    exclusoes,
    gestoresComerciais,
    buscarInclusoes,
    buscarExclusoes,
    buscarGestoresComerciais,
    calcularTotais
  } = useMovimentacoes();

  // Estados
  const [mesSelecionado, setMesSelecionado] = useState<number | null>(null); // null = ACUMULADO
  const [gestorSelecionado, setGestorSelecionado] = useState<number | null>(null);
  const [dadosInclusoes, setDadosInclusoes] = useState<InclusaoConsultor[]>([]);
  const [dadosExclusoes, setDadosExclusoes] = useState<ExclusaoConsultor[]>([]);
  const [totais, setTotais] = useState<TotaisMovimentacao>({
    totalInclusoes: 0,
    valorTotalInclusoes: 0,
    totalExclusoes: 0,
    valorTotalExclusoes: 0,
    saldoLiquido: 0,
    valorLiquido: 0
  });

  // Ano atual
  const anoAtual = new Date().getFullYear();

  // ============================================
  // CARREGAR DADOS
  // ============================================

  useEffect(() => {
    buscarGestoresComerciais();
  }, []);

  useEffect(() => {
    carregarMovimentacoes();
  }, [mesSelecionado, gestorSelecionado]);

  const carregarMovimentacoes = async () => {
    const [inc, exc] = await Promise.all([
      buscarInclusoes(mesSelecionado, anoAtual, gestorSelecionado),
      buscarExclusoes(mesSelecionado, anoAtual, gestorSelecionado)
    ]);

    setDadosInclusoes(inc);
    setDadosExclusoes(exc);
    setTotais(calcularTotais(inc, exc));
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleMesClick = (mes: number | null) => {
    setMesSelecionado(mes);
  };

  const handleGestorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const valor = e.target.value;
    setGestorSelecionado(valor ? parseInt(valor) : null);
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">📊 Movimentações de Consultores</h1>
              <p className="text-sm text-gray-500">Relatório de Inclusões e Exclusões - {anoAtual}</p>
            </div>
            
            {/* Filtro Gestão Comercial */}
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-600">Gestão Comercial:</label>
              <select
                value={gestorSelecionado || ''}
                onChange={handleGestorChange}
                className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 min-w-[200px]"
              >
                <option value="">Todos</option>
                {gestoresComerciais.map(g => (
                  <option key={g.id} value={g.id}>{g.nome_usuario}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabs de Meses */}
          <div className="flex gap-1 overflow-x-auto pb-2">
            {MESES.map(mes => (
              <button
                key={mes.valor}
                onClick={() => handleMesClick(mes.valor)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  mesSelecionado === mes.valor
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {mes.label}
              </button>
            ))}
            <button
              onClick={() => handleMesClick(null)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors whitespace-nowrap ${
                mesSelecionado === null
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              ACUMULADO
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-6 space-y-6">
        {/* Cards de Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
            <p className="text-sm text-gray-500">Total Inclusões</p>
            <p className="text-2xl font-bold text-green-600">{totais.totalInclusoes}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
            <p className="text-sm text-gray-500">Valor Inclusões</p>
            <p className="text-xl font-bold text-green-600">{formatarMoeda(totais.valorTotalInclusoes)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-500">
            <p className="text-sm text-gray-500">Total Exclusões</p>
            <p className="text-2xl font-bold text-red-600">{totais.totalExclusoes}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-500">
            <p className="text-sm text-gray-500">Valor Exclusões</p>
            <p className="text-xl font-bold text-red-600">{formatarMoeda(totais.valorTotalExclusoes)}</p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            <span className="ml-3 text-gray-500">Carregando...</span>
          </div>
        )}

        {/* Seção INCLUSÕES */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-green-600 px-6 py-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>➕</span>
              INCLUSÃO - Total: {String(dadosInclusoes.length).padStart(2, '0')}
            </h2>
          </div>
          
          {dadosInclusoes.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-red-700 text-white">
                      <th className="px-4 py-3 text-left font-semibold">CLIENTE</th>
                      <th className="px-4 py-3 text-left font-semibold">PERFIL</th>
                      <th className="px-4 py-3 text-left font-semibold">ALOCADO</th>
                      <th className="px-4 py-3 text-left font-semibold">MOVIMENTAÇÃO</th>
                      <th className="px-4 py-3 text-right font-semibold">VALOR MENSAL</th>
                      <th className="px-4 py-3 text-right font-semibold">VALOR ANUAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dadosInclusoes.map((item, idx) => (
                      <tr key={item.consultor_id || idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {item.razao_social_cliente}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {item.cargo_consultores}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {item.nome_consultores}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            item.tipo_de_vaga === 'Reposição' 
                              ? 'bg-orange-100 text-orange-700' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {item.tipo_de_vaga}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800">
                          {formatarMoeda(item.valor_mensal)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800">
                          {formatarMoeda(item.valor_anual)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 font-bold">
                      <td colSpan={4} className="px-4 py-3 text-right">Total</td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {formatarMoeda(totais.valorTotalInclusoes)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {formatarMoeda(totais.valorTotalInclusoes * 12)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-gray-400">
              <span className="text-4xl">📭</span>
              <p className="mt-2">Nenhuma inclusão no período selecionado</p>
            </div>
          )}
        </div>

        {/* Seção EXCLUSÕES */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-red-600 px-6 py-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>➖</span>
              EXCLUSÃO - Total: {String(dadosExclusoes.length).padStart(2, '0')}
            </h2>
          </div>
          
          {dadosExclusoes.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-red-700 text-white">
                      <th className="px-4 py-3 text-left font-semibold">CLIENTE</th>
                      <th className="px-4 py-3 text-left font-semibold">FUNÇÃO</th>
                      <th className="px-4 py-3 text-left font-semibold">NOME CONSULTOR</th>
                      <th className="px-4 py-3 text-left font-semibold">MOTIVAÇÃO</th>
                      <th className="px-4 py-3 text-right font-semibold">VALOR MENSAL</th>
                      <th className="px-4 py-3 text-right font-semibold">VALOR ANUAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dadosExclusoes.map((item, idx) => (
                      <tr key={item.consultor_id || idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {item.razao_social_cliente}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {item.cargo_consultores}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {item.nome_consultores}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            item.label_substituicao === 'Reposição' 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {item.label_substituicao}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800">
                          {formatarMoeda(item.valor_mensal)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800">
                          {formatarMoeda(item.valor_anual)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 font-bold">
                      <td colSpan={4} className="px-4 py-3 text-right">Total</td>
                      <td className="px-4 py-3 text-right text-red-600">
                        {formatarMoeda(totais.valorTotalExclusoes)}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600">
                        {formatarMoeda(totais.valorTotalExclusoes * 12)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-gray-400">
              <span className="text-4xl">📭</span>
              <p className="mt-2">Nenhuma exclusão no período selecionado</p>
            </div>
          )}
        </div>

        {/* Resumo Final */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-6 text-white">
          <h3 className="text-lg font-bold mb-4">📈 Resumo do Período</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-gray-400 text-sm">Saldo Líquido</p>
              <p className={`text-2xl font-bold ${totais.saldoLiquido >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totais.saldoLiquido >= 0 ? '+' : ''}{totais.saldoLiquido}
              </p>
              <p className="text-xs text-gray-500">consultores</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Valor Líquido Mensal</p>
              <p className={`text-xl font-bold ${totais.valorLiquido >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totais.valorLiquido >= 0 ? '+' : ''}{formatarMoeda(totais.valorLiquido)}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Inclusões</p>
              <p className="text-xl font-bold text-green-400">
                {totais.totalInclusoes} ({formatarMoeda(totais.valorTotalInclusoes)})
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Exclusões</p>
              <p className="text-xl font-bold text-red-400">
                {totais.totalExclusoes} ({formatarMoeda(totais.valorTotalExclusoes)})
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovimentacoesConsultores;

