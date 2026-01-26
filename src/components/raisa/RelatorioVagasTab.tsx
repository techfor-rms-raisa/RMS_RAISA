/**
 * RelatorioVagasTab.tsx - RMS RAISA v1.1
 * Componente de Relatório de Vagas com Candidaturas
 * 
 * Funcionalidades:
 * - Visualização em lista das vagas com candidaturas expandidas (sublinha sempre visível)
 * - Filtros: Status, Período, Cliente, Analista R&S
 * - Exportação PDF e XLS
 * 
 * v1.1 (26/01/2026):
 * - Corrigido: Import do jspdf-autotable para funcionar corretamente
 * - Corrigido: Filtro de Analistas mostra apenas tipo_usuario = 'Analista de R&S'
 * 
 * Data: 26/01/2026
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText, Download, Filter, Calendar, Building2, User, 
  Briefcase, AlertCircle, CheckCircle, Clock, XCircle,
  ChevronDown, ChevronUp, Loader2, FileSpreadsheet, Printer,
  Users, Zap, RefreshCw
} from 'lucide-react';
import { Vaga, Client } from '../../types/types_index';
import { supabase } from '../../config/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================
// TIPOS
// ============================================

interface CandidaturaVaga {
  id: number;
  pessoa_id: number;
  vaga_id: number;
  status: string;
  created_at: string;
  analista_id?: number;
  candidato_nome?: string;
  pessoa?: {
    id: number;
    nome: string;
    email?: string;
  };
  analista?: {
    id: number;
    nome_usuario: string;
  };
}

interface VagaComCandidaturas extends Vaga {
  candidaturas: CandidaturaVaga[];
  analistas_nomes?: string[];
  cliente_nome?: string;
}

interface UserInfo {
  id: number;
  nome_usuario: string;
}

interface RelatorioVagasTabProps {
  vagas: Vaga[];
  clients: Client[];
  onReload?: () => void;
}

// ============================================
// CONFIGURAÇÕES
// ============================================

const STATUS_VAGA_CONFIG: Record<string, { label: string; cor: string; bgCor: string }> = {
  'aberta': { label: 'Aberta', cor: 'text-green-700', bgCor: 'bg-green-100' },
  'em_andamento': { label: 'Em Andamento', cor: 'text-blue-700', bgCor: 'bg-blue-100' },
  'pausada': { label: 'Pausada', cor: 'text-yellow-700', bgCor: 'bg-yellow-100' },
  'fechada': { label: 'Fechada', cor: 'text-gray-700', bgCor: 'bg-gray-100' },
  'aprovada': { label: 'Aprovada', cor: 'text-emerald-700', bgCor: 'bg-emerald-100' },
  'perdida': { label: 'Perdida', cor: 'text-red-700', bgCor: 'bg-red-100' },
  'cancelada': { label: 'Cancelada', cor: 'text-gray-500', bgCor: 'bg-gray-200' }
};

const STATUS_CANDIDATURA_CONFIG: Record<string, { label: string; cor: string; bgCor: string }> = {
  'triagem': { label: 'Triagem', cor: 'text-gray-700', bgCor: 'bg-gray-100' },
  'entrevista': { label: 'Entrevista', cor: 'text-blue-700', bgCor: 'bg-blue-100' },
  'aprovado': { label: 'Aprovado', cor: 'text-green-700', bgCor: 'bg-green-100' },
  'reprovado': { label: 'Reprovado', cor: 'text-red-700', bgCor: 'bg-red-100' },
  'indicacao_aprovada': { label: 'Indicação Aprovada', cor: 'text-amber-700', bgCor: 'bg-amber-100' },
  'enviado_cliente': { label: 'Enviado ao Cliente', cor: 'text-purple-700', bgCor: 'bg-purple-100' },
  'aguardando_cliente': { label: 'Aguardando Cliente', cor: 'text-yellow-700', bgCor: 'bg-yellow-100' },
  'entrevista_cliente': { label: 'Entrevista Cliente', cor: 'text-indigo-700', bgCor: 'bg-indigo-100' },
  'aprovado_cliente': { label: 'Aprovado pelo Cliente', cor: 'text-emerald-700', bgCor: 'bg-emerald-100' },
  'reprovado_cliente': { label: 'Reprovado pelo Cliente', cor: 'text-rose-700', bgCor: 'bg-rose-100' },
  'contratado': { label: 'Contratado', cor: 'text-teal-700', bgCor: 'bg-teal-100' }
};

const PERIODO_OPTIONS = [
  { value: 'todos', label: 'Todos os períodos' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mês' },
  { value: 'personalizado', label: 'Período personalizado' }
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const RelatorioVagasTab: React.FC<RelatorioVagasTabProps> = ({
  vagas,
  clients,
  onReload
}) => {
  // Estados de dados
  const [vagasComCandidaturas, setVagasComCandidaturas] = useState<VagaComCandidaturas[]>([]);
  const [analistas, setAnalistas] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);

  // Estados dos filtros
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('todos');
  const [filtroCliente, setFiltroCliente] = useState<string>('todos');
  const [filtroAnalista, setFiltroAnalista] = useState<string>('todos');
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');

  // ============================================
  // CARREGAR DADOS
  // ============================================

  useEffect(() => {
    carregarDados();
  }, [vagas]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // 1. Carregar analistas - APENAS tipo_usuario = 'Analista de R&S'
      const { data: analistasData } = await supabase
        .from('app_users')
        .select('id, nome_usuario')
        .eq('tipo_usuario', 'Analista de R&S')
        .eq('ativo_usuario', true)
        .order('nome_usuario');

      if (analistasData) {
        setAnalistas(analistasData);
      }

      // 2. Carregar candidaturas de todas as vagas
      const vagaIds = vagas.map(v => v.id);
      
      if (vagaIds.length === 0) {
        setVagasComCandidaturas([]);
        setLoading(false);
        return;
      }

      const { data: candidaturasData } = await supabase
        .from('candidaturas')
        .select(`
          id,
          pessoa_id,
          vaga_id,
          status,
          created_at,
          analista_id,
          candidato_nome,
          pessoas:pessoa_id (id, nome, email),
          app_users:analista_id (id, nome_usuario)
        `)
        .in('vaga_id', vagaIds)
        .order('created_at', { ascending: false });

      // 3. Carregar analistas por vaga (via candidaturas)
      const analistasPorVaga: Record<string, Set<string>> = {};
      
      if (candidaturasData) {
        candidaturasData.forEach((c: any) => {
          const vagaId = String(c.vaga_id);
          if (!analistasPorVaga[vagaId]) {
            analistasPorVaga[vagaId] = new Set();
          }
          if (c.app_users?.nome_usuario) {
            analistasPorVaga[vagaId].add(c.app_users.nome_usuario);
          }
        });
      }

      // 4. Montar vagas com candidaturas
      const vagasProcessadas: VagaComCandidaturas[] = vagas.map(vaga => {
        const candidaturasVaga = candidaturasData?.filter((c: any) => 
          String(c.vaga_id) === String(vaga.id)
        ) || [];

        // Buscar nome do cliente
        const cliente = clients.find(c => String(c.id) === String(vaga.cliente_id));
        
        return {
          ...vaga,
          candidaturas: candidaturasVaga.map((c: any) => ({
            id: c.id,
            pessoa_id: c.pessoa_id,
            vaga_id: c.vaga_id,
            status: c.status,
            created_at: c.created_at,
            analista_id: c.analista_id,
            candidato_nome: c.candidato_nome || c.pessoas?.nome,
            pessoa: c.pessoas,
            analista: c.app_users
          })),
          analistas_nomes: Array.from(analistasPorVaga[String(vaga.id)] || []),
          cliente_nome: cliente?.razao_social_cliente || cliente?.nome_fantasia_cliente || 'Não informado'
        };
      });

      setVagasComCandidaturas(vagasProcessadas);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // FILTROS
  // ============================================

  const vagasFiltradas = useMemo(() => {
    let resultado = [...vagasComCandidaturas];

    // Filtro por status da vaga
    if (filtroStatus !== 'todos') {
      resultado = resultado.filter(v => v.status === filtroStatus);
    }

    // Filtro por cliente
    if (filtroCliente !== 'todos') {
      resultado = resultado.filter(v => String(v.cliente_id) === filtroCliente);
    }

    // Filtro por analista
    if (filtroAnalista !== 'todos') {
      const analistaNome = analistas.find(a => String(a.id) === filtroAnalista)?.nome_usuario;
      if (analistaNome) {
        resultado = resultado.filter(v => 
          v.analistas_nomes?.includes(analistaNome) ||
          v.candidaturas.some(c => c.analista?.nome_usuario === analistaNome)
        );
      }
    }

    // Filtro por período
    if (filtroPeriodo !== 'todos') {
      const hoje = new Date();
      let dataLimiteInicio: Date;
      let dataLimiteFim: Date = hoje;

      if (filtroPeriodo === 'semana') {
        // Início da semana (domingo)
        dataLimiteInicio = new Date(hoje);
        dataLimiteInicio.setDate(hoje.getDate() - hoje.getDay());
        dataLimiteInicio.setHours(0, 0, 0, 0);
      } else if (filtroPeriodo === 'mes') {
        // Início do mês
        dataLimiteInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      } else if (filtroPeriodo === 'personalizado' && dataInicio) {
        dataLimiteInicio = new Date(dataInicio);
        if (dataFim) {
          dataLimiteFim = new Date(dataFim);
          dataLimiteFim.setHours(23, 59, 59, 999);
        }
      } else {
        return resultado;
      }

      resultado = resultado.filter(v => {
        const dataVaga = new Date(v.criado_em || v.createdAt || '');
        return dataVaga >= dataLimiteInicio && dataVaga <= dataLimiteFim;
      });
    }

    // Ordenar por data de criação (mais recentes primeiro)
    resultado.sort((a, b) => {
      const dataA = new Date(a.criado_em || a.createdAt || '');
      const dataB = new Date(b.criado_em || b.createdAt || '');
      return dataB.getTime() - dataA.getTime();
    });

    return resultado;
  }, [vagasComCandidaturas, filtroStatus, filtroCliente, filtroAnalista, filtroPeriodo, dataInicio, dataFim, analistas]);

  // ============================================
  // ESTATÍSTICAS
  // ============================================

  const estatisticas = useMemo(() => {
    const totalVagas = vagasFiltradas.length;
    const totalCandidaturas = vagasFiltradas.reduce((acc, v) => acc + v.candidaturas.length, 0);
    const vagasUrgentes = vagasFiltradas.filter(v => v.urgente).length;
    const vagasAbertas = vagasFiltradas.filter(v => v.status === 'aberta').length;

    return { totalVagas, totalCandidaturas, vagasUrgentes, vagasAbertas };
  }, [vagasFiltradas]);

  // ============================================
  // EXPORTAR XLS
  // ============================================

  const exportarXLS = async () => {
    setExportando(true);
    try {
      const dados: any[] = [];

      vagasFiltradas.forEach(vaga => {
        // Linha da vaga
        const linhaVaga = {
          'Tipo': '📁 VAGA',
          'Código/Nome': vaga.titulo,
          'Status': STATUS_VAGA_CONFIG[vaga.status]?.label || vaga.status,
          'Data Abertura': vaga.criado_em ? new Date(vaga.criado_em).toLocaleDateString('pt-BR') : '-',
          'Cliente': vaga.cliente_nome || '-',
          'Analistas R&S': vaga.analistas_nomes?.join(', ') || '-',
          'Tipo Posição': vaga.status_posicao === 'substituicao' ? 'Substituição' : 'Nova Posição',
          'Urgente': vaga.urgente ? '⚡ SIM' : 'Não',
          'Qtd Candidaturas': vaga.candidaturas.length
        };
        dados.push(linhaVaga);

        // Linhas das candidaturas
        vaga.candidaturas.forEach(cand => {
          const linhaCand = {
            'Tipo': '   └─ Candidatura',
            'Código/Nome': cand.candidato_nome || cand.pessoa?.nome || `ID ${cand.pessoa_id}`,
            'Status': STATUS_CANDIDATURA_CONFIG[cand.status]?.label || cand.status,
            'Data Abertura': cand.created_at ? new Date(cand.created_at).toLocaleDateString('pt-BR') : '-',
            'Cliente': '',
            'Analistas R&S': cand.analista?.nome_usuario || '-',
            'Tipo Posição': '',
            'Urgente': '',
            'Qtd Candidaturas': ''
          };
          dados.push(linhaCand);
        });

        // Linha vazia para separar vagas
        dados.push({});
      });

      // Criar workbook
      const ws = XLSX.utils.json_to_sheet(dados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Relatório Vagas');

      // Ajustar largura das colunas
      ws['!cols'] = [
        { wch: 18 }, // Tipo
        { wch: 40 }, // Código/Nome
        { wch: 20 }, // Status
        { wch: 15 }, // Data
        { wch: 25 }, // Cliente
        { wch: 30 }, // Analistas
        { wch: 15 }, // Tipo Posição
        { wch: 10 }, // Urgente
        { wch: 15 }  // Qtd
      ];

      // Download
      const dataAtual = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `relatorio_vagas_${dataAtual}.xlsx`);

    } catch (error) {
      console.error('Erro ao exportar XLS:', error);
      alert('Erro ao exportar relatório. Tente novamente.');
    } finally {
      setExportando(false);
    }
  };

  // ============================================
  // EXPORTAR PDF
  // ============================================

  const exportarPDF = async () => {
    setExportando(true);
    try {
      const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Título
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Relatório de Vagas e Candidaturas', pageWidth / 2, 15, { align: 'center' });
      
      // Subtítulo com data
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 22, { align: 'center' });

      // Estatísticas
      doc.setFontSize(9);
      doc.text(`Total: ${estatisticas.totalVagas} vagas | ${estatisticas.totalCandidaturas} candidaturas | ${estatisticas.vagasUrgentes} urgentes`, pageWidth / 2, 28, { align: 'center' });

      // Dados para a tabela
      const tableData: any[] = [];

      vagasFiltradas.forEach(vaga => {
        // Linha da vaga
        tableData.push([
          { content: '📁', styles: { fontStyle: 'bold' } },
          { content: vaga.titulo, styles: { fontStyle: 'bold' } },
          STATUS_VAGA_CONFIG[vaga.status]?.label || vaga.status,
          vaga.criado_em ? new Date(vaga.criado_em).toLocaleDateString('pt-BR') : '-',
          vaga.analistas_nomes?.join(', ') || '-',
          vaga.status_posicao === 'substituicao' ? 'Subst.' : 'Nova',
          vaga.urgente ? '⚡' : ''
        ]);

        // Linhas das candidaturas
        vaga.candidaturas.forEach(cand => {
          tableData.push([
            { content: '  └─', styles: { textColor: [150, 150, 150] } },
            { content: cand.candidato_nome || cand.pessoa?.nome || '-', styles: { textColor: [80, 80, 80] } },
            STATUS_CANDIDATURA_CONFIG[cand.status]?.label || cand.status,
            cand.created_at ? new Date(cand.created_at).toLocaleDateString('pt-BR') : '-',
            cand.analista?.nome_usuario || '-',
            '',
            ''
          ]);
        });
      });

      // Gerar tabela
      autoTable(doc, {
        startY: 35,
        head: [['', 'Vaga / Candidato', 'Status', 'Data', 'Analista R&S', 'Tipo', 'Urg.']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [234, 88, 12], // Orange
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 8
        },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 70 },
          2: { cellWidth: 35 },
          3: { cellWidth: 25 },
          4: { cellWidth: 45 },
          5: { cellWidth: 20 },
          6: { cellWidth: 12 }
        },
        margin: { left: 10, right: 10 }
      });

      // Download
      const dataAtual = new Date().toISOString().split('T')[0];
      doc.save(`relatorio_vagas_${dataAtual}.pdf`);

    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      alert('Erro ao exportar PDF. Tente novamente.');
    } finally {
      setExportando(false);
    }
  };

  // ============================================
  // FUNÇÕES AUXILIARES
  // ============================================

  const formatarData = (data: string | undefined) => {
    if (!data) return '-';
    return new Date(data).toLocaleDateString('pt-BR');
  };

  const limparFiltros = () => {
    setFiltroStatus('todos');
    setFiltroPeriodo('todos');
    setFiltroCliente('todos');
    setFiltroAnalista('todos');
    setDataInicio('');
    setDataFim('');
  };

  const temFiltrosAtivos = filtroStatus !== 'todos' || filtroPeriodo !== 'todos' || 
                          filtroCliente !== 'todos' || filtroAnalista !== 'todos';

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        <span className="ml-3 text-gray-600">Carregando relatório...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ============================================ */}
      {/* BARRA DE FILTROS */}
      {/* ============================================ */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Filtro Status */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Status da Vaga</label>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="todos">Todos os Status</option>
              {Object.entries(STATUS_VAGA_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>

          {/* Filtro Período */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Período</label>
            <select
              value={filtroPeriodo}
              onChange={(e) => setFiltroPeriodo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              {PERIODO_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Datas personalizadas */}
          {filtroPeriodo === 'personalizado' && (
            <>
              <div className="min-w-[140px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">De</label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="min-w-[140px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">Até</label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </>
          )}

          {/* Filtro Cliente */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="todos">Todos os Clientes</option>
              {clients.map(cliente => (
                <option key={cliente.id} value={String(cliente.id)}>
                  {cliente.razao_social_cliente || cliente.nome_fantasia_cliente}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Analista */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Analista R&S</label>
            <select
              value={filtroAnalista}
              onChange={(e) => setFiltroAnalista(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="todos">Todos os Analistas</option>
              {analistas.map(analista => (
                <option key={analista.id} value={String(analista.id)}>
                  {analista.nome_usuario}
                </option>
              ))}
            </select>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-end gap-2">
            {temFiltrosAtivos && (
              <button
                onClick={limparFiltros}
                className="px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Limpar
              </button>
            )}
            
            <button
              onClick={onReload || carregarDados}
              className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
              title="Atualizar dados"
            >
              <RefreshCw className="w-5 h-5" />
            </button>

            <button
              onClick={exportarXLS}
              disabled={exportando || vagasFiltradas.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Exportar XLS
            </button>

            <button
              onClick={exportarPDF}
              disabled={exportando || vagasFiltradas.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Imprimir PDF
            </button>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-gray-600">
              <strong>{estatisticas.totalVagas}</strong> vagas
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-gray-600">
              <strong>{estatisticas.totalCandidaturas}</strong> candidaturas
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-red-500" />
            <span className="text-sm text-gray-600">
              <strong>{estatisticas.vagasUrgentes}</strong> urgentes
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-600">
              <strong>{estatisticas.vagasAbertas}</strong> abertas
            </span>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* LISTA DE VAGAS COM CANDIDATURAS */}
      {/* ============================================ */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {vagasFiltradas.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">Nenhuma vaga encontrada</h3>
            <p className="text-gray-400">Ajuste os filtros para ver resultados</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {vagasFiltradas.map((vaga) => (
              <div key={vaga.id} className="hover:bg-gray-50 transition-colors">
                {/* Linha da Vaga */}
                <div className="p-4 flex items-center gap-4">
                  {/* Urgente */}
                  {vaga.urgente && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      URGENTE
                    </span>
                  )}

                  {/* Título */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 truncate">{vaga.titulo}</h3>
                    <p className="text-sm text-gray-500 truncate">
                      {vaga.cliente_nome}
                    </p>
                  </div>

                  {/* Status */}
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_VAGA_CONFIG[vaga.status]?.bgCor} ${STATUS_VAGA_CONFIG[vaga.status]?.cor}`}>
                    {STATUS_VAGA_CONFIG[vaga.status]?.label || vaga.status}
                  </span>

                  {/* Data Abertura */}
                  <div className="text-center min-w-[80px]">
                    <p className="text-xs text-gray-400">Abertura</p>
                    <p className="text-sm font-medium text-gray-700">{formatarData(vaga.criado_em || vaga.createdAt)}</p>
                  </div>

                  {/* Analistas */}
                  <div className="min-w-[150px]">
                    <p className="text-xs text-gray-400">Analistas R&S</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {vaga.analistas_nomes && vaga.analistas_nomes.length > 0 ? (
                        vaga.analistas_nomes.slice(0, 2).map((nome, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                            {nome.split(' ')[0]}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                      {vaga.analistas_nomes && vaga.analistas_nomes.length > 2 && (
                        <span className="text-xs text-gray-400">+{vaga.analistas_nomes.length - 2}</span>
                      )}
                    </div>
                  </div>

                  {/* Tipo Posição */}
                  <span className={`px-2 py-1 text-xs rounded ${
                    vaga.status_posicao === 'substituicao' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {vaga.status_posicao === 'substituicao' ? 'Substituição' : 'Nova Posição'}
                  </span>

                  {/* Contador Candidaturas */}
                  <div className="flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700">{vaga.candidaturas.length}</span>
                  </div>
                </div>

                {/* Lista de Candidaturas (sempre visível) */}
                {vaga.candidaturas.length > 0 && (
                  <div className="bg-gray-50 border-t border-gray-100">
                    {vaga.candidaturas.map((cand, idx) => (
                      <div 
                        key={cand.id} 
                        className={`flex items-center gap-4 px-4 py-2 pl-12 ${
                          idx < vaga.candidaturas.length - 1 ? 'border-b border-gray-100' : ''
                        }`}
                      >
                        {/* Indicador visual */}
                        <span className="text-gray-300 text-sm">└─</span>

                        {/* Nome do candidato */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">
                            {cand.candidato_nome || cand.pessoa?.nome || `Candidato #${cand.pessoa_id}`}
                          </p>
                        </div>

                        {/* Status da candidatura */}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          STATUS_CANDIDATURA_CONFIG[cand.status]?.bgCor || 'bg-gray-100'
                        } ${STATUS_CANDIDATURA_CONFIG[cand.status]?.cor || 'text-gray-700'}`}>
                          {STATUS_CANDIDATURA_CONFIG[cand.status]?.label || cand.status}
                        </span>

                        {/* Data inclusão */}
                        <span className="text-xs text-gray-500 min-w-[80px] text-center">
                          {formatarData(cand.created_at)}
                        </span>

                        {/* Analista responsável */}
                        <span className="text-xs text-gray-500 min-w-[100px]">
                          {cand.analista?.nome_usuario || '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sem candidaturas */}
                {vaga.candidaturas.length === 0 && (
                  <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 pl-12">
                    <span className="text-gray-300 text-sm">└─</span>
                    <span className="text-sm text-gray-400 italic ml-2">Nenhuma candidatura registrada</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RelatorioVagasTab;
