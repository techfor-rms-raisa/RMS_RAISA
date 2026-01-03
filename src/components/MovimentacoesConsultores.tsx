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
 * ============================================
 * DESIGN: Soft & Modern
 * - Cores suaves (slate, emerald, rose)
 * - Bordas arredondadas
 * - Sombras sutis
 * - Transições suaves
 * ============================================
 * 
 * Versão: 2.0
 * Data: 30/12/2024
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  useMovimentacoes, 
  InclusaoConsultor, 
  ExclusaoConsultor,
  TotaisMovimentacao,
  MESES 
} from '../hooks/supabase/useMovimentacoes';
import { TrendingUp, TrendingDown, Users, DollarSign, ArrowUpCircle, ArrowDownCircle, RefreshCw } from 'lucide-react';

// ============================================
// FORMATADORES
// ============================================

const formatarMoeda = (valor: number): string => {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
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
  const [mesSelecionado, setMesSelecionado] = useState<number | null>(null);
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

  // ✅ v2.5: Ano selecionável
  const anoAtual = new Date().getFullYear();
  const [anoSelecionado, setAnoSelecionado] = useState<number>(anoAtual);

  // ✅ v2.5: Anos disponíveis (atual e anteriores)
  const anosDisponiveis = useMemo(() => {
    return [anoAtual, anoAtual - 1, anoAtual - 2].filter(a => a >= 2024);
  }, [anoAtual]);

  // ============================================
  // CARREGAR DADOS
  // ============================================

  useEffect(() => {
    buscarGestoresComerciais();
  }, []);

  useEffect(() => {
    carregarMovimentacoes();
  }, [mesSelecionado, gestorSelecionado, anoSelecionado]); // ✅ v2.5: Inclui ano nas dependências

  const carregarMovimentacoes = async () => {
    const [inc, exc] = await Promise.all([
      buscarInclusoes(mesSelecionado, anoSelecionado, gestorSelecionado), // ✅ v2.5: Usa anoSelecionado
      buscarExclusoes(mesSelecionado, anoSelecionado, gestorSelecionado)  // ✅ v2.5: Usa anoSelecionado
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
    <div className="min-h-screen bg-slate-50/50">
      {/* Header - Design Soft */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-indigo-500" />
                Movimentações de Consultores
              </h1>
              <p className="text-sm text-slate-500 mt-1">Relatório de Inclusões e Exclusões - {anoSelecionado}</p>
            </div>
            
            {/* Filtros - Gestão Comercial e Ano */}
            <div className="flex items-center gap-4">
              {/* ✅ v2.5: Filtro de Ano */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-600">Ano:</label>
                <select
                  value={anoSelecionado}
                  onChange={(e) => setAnoSelecionado(parseInt(e.target.value))}
                  className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all shadow-sm"
                >
                  {anosDisponiveis.map(ano => (
                    <option key={ano} value={ano}>{ano}</option>
                  ))}
                </select>
              </div>

              {/* Filtro Gestão Comercial */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-600">Gestão Comercial:</label>
                <select
                  value={gestorSelecionado || ''}
                  onChange={handleGestorChange}
                  className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 min-w-[200px] transition-all shadow-sm"
                >
                  <option value="">Todos</option>
                  {gestoresComerciais.map(g => (
                    <option key={g.id} value={g.id}>{g.nome_usuario}</option>
                  ))}
                </select>
              </div>
              
              {loading && (
                <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
              )}
            </div>
          </div>

          {/* Tabs de Meses - Design Soft */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {MESES.map(mes => (
              <button
                key={mes.valor}
                onClick={() => handleMesClick(mes.valor)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                  mesSelecionado === mes.valor
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/25'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {mes.label}
              </button>
            ))}
            <button
              onClick={() => handleMesClick(null)}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-200 whitespace-nowrap ${
                mesSelecionado === null
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              ACUMULADO
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-6 space-y-6">
        {/* Cards de Resumo - Design Soft */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Card Inclusões Quantidade */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-emerald-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Inclusões</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">{totais.totalInclusoes}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <ArrowUpCircle className="w-6 h-6 text-emerald-500" />
              </div>
            </div>
          </div>
          
          {/* Card Inclusões Valor */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-emerald-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Valor Inclusões</p>
                <p className="text-xl font-bold text-emerald-600 mt-1">{formatarMoeda(totais.valorTotalInclusoes)}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-emerald-500" />
              </div>
            </div>
          </div>
          
          {/* Card Exclusões Quantidade */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-rose-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Exclusões</p>
                <p className="text-3xl font-bold text-rose-500 mt-1">{totais.totalExclusoes}</p>
              </div>
              <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center">
                <ArrowDownCircle className="w-6 h-6 text-rose-400" />
              </div>
            </div>
          </div>
          
          {/* Card Exclusões Valor */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-rose-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Valor Exclusões</p>
                <p className="text-xl font-bold text-rose-500 mt-1">{formatarMoeda(totais.valorTotalExclusoes)}</p>
              </div>
              <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-rose-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Seção INCLUSÕES - Design Soft */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5" />
              INCLUSÃO - Total: {String(dadosInclusoes.length).padStart(2, '0')}
            </h2>
          </div>
          
          {dadosInclusoes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-5 py-3.5 text-left font-semibold text-slate-600">CLIENTE</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-slate-600">PERFIL</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-slate-600">ALOCADO</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-slate-600">MOVIMENTAÇÃO</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-slate-600">VALOR MENSAL</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-slate-600">VALOR ANUAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dadosInclusoes.map((item, idx) => (
                    <tr key={item.consultor_id || idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-800">
                        {item.razao_social_cliente}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {item.cargo_consultores}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {item.nome_consultores}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          item.tipo_de_vaga === 'Reposição' 
                            ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                            : 'bg-sky-50 text-sky-700 border border-sky-200'
                        }`}>
                          {item.tipo_de_vaga}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-700">
                        {formatarMoeda(item.valor_mensal)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-700">
                        {formatarMoeda(item.valor_anual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-50/50 border-t-2 border-emerald-200">
                    <td colSpan={4} className="px-5 py-3.5 text-right font-semibold text-slate-600">Total</td>
                    <td className="px-5 py-3.5 text-right font-bold text-emerald-600">
                      {formatarMoeda(totais.valorTotalInclusoes)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-emerald-600">
                      {formatarMoeda(totais.valorTotalInclusoes * 12)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500">Nenhuma inclusão no período selecionado</p>
            </div>
          )}
        </div>

        {/* Seção EXCLUSÕES - Design Soft */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="bg-gradient-to-r from-rose-400 to-rose-500 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ArrowDownCircle className="w-5 h-5" />
              EXCLUSÃO - Total: {String(dadosExclusoes.length).padStart(2, '0')}
            </h2>
          </div>
          
          {dadosExclusoes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-5 py-3.5 text-left font-semibold text-slate-600">CLIENTE</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-slate-600">FUNÇÃO</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-slate-600">NOME CONSULTOR</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-slate-600">MOTIVAÇÃO</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-slate-600">VALOR MENSAL</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-slate-600">VALOR ANUAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dadosExclusoes.map((item, idx) => (
                    <tr key={item.consultor_id || idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-800">
                        {item.razao_social_cliente}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {item.cargo_consultores}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {item.nome_consultores}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          item.label_substituicao === 'Reposição' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {item.label_substituicao}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-700">
                        {formatarMoeda(item.valor_mensal)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-700">
                        {formatarMoeda(item.valor_anual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-rose-50/50 border-t-2 border-rose-200">
                    <td colSpan={4} className="px-5 py-3.5 text-right font-semibold text-slate-600">Total</td>
                    <td className="px-5 py-3.5 text-right font-bold text-rose-500">
                      {formatarMoeda(totais.valorTotalExclusoes)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-rose-500">
                      {formatarMoeda(totais.valorTotalExclusoes * 12)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500">Nenhuma exclusão no período selecionado</p>
            </div>
          )}
        </div>

        {/* Resumo Final - Design Soft com Glassmorphism */}
        <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
          <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            Resumo do Período
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <p className="text-slate-400 text-sm">Saldo Líquido</p>
              <p className={`text-2xl font-bold mt-1 ${totais.saldoLiquido >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totais.saldoLiquido >= 0 ? '+' : ''}{totais.saldoLiquido}
              </p>
              <p className="text-xs text-slate-500 mt-1">consultores</p>
            </div>
            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <p className="text-slate-400 text-sm">Valor Líquido Mensal</p>
              <p className={`text-xl font-bold mt-1 ${totais.valorLiquido >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totais.valorLiquido >= 0 ? '+' : ''}{formatarMoeda(totais.valorLiquido)}
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <p className="text-slate-400 text-sm">Inclusões</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">
                {totais.totalInclusoes}
              </p>
              <p className="text-xs text-emerald-400/70 mt-1">{formatarMoeda(totais.valorTotalInclusoes)}</p>
            </div>
            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <p className="text-slate-400 text-sm">Exclusões</p>
              <p className="text-xl font-bold text-rose-400 mt-1">
                {totais.totalExclusoes}
              </p>
              <p className="text-xs text-rose-400/70 mt-1">{formatarMoeda(totais.valorTotalExclusoes)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovimentacoesConsultores;
