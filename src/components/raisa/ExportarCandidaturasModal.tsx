/**
 * ExportarCandidaturasModal.tsx - Modal de Exportação de Candidaturas
 * 
 * Permite exportar candidaturas para Excel com filtros:
 * - Vaga
 * - Cliente
 * - Analista R&S
 * - Status
 * 
 * Versão: 1.0
 * Data: 12/01/2026
 */

import React, { useState, useMemo } from 'react';
import { 
  X, Download, FileSpreadsheet, Filter, 
  Building2, Briefcase, User, CheckCircle,
  Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Candidatura, Vaga } from '@/types';

// ============================================
// TIPOS
// ============================================

interface ClienteInfo {
  id: number | string;
  razao_social_cliente?: string;
  nome?: string;
}

interface UserInfo {
  id: number | string;
  nome_usuario?: string;
  nome?: string;
}

interface ExportarCandidaturasModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidaturas: Candidatura[];
  vagas: Vaga[];
  clientes: ClienteInfo[];
  usuarios: UserInfo[];
}

// ============================================
// CONFIGURAÇÕES DE STATUS
// ============================================

const STATUS_LABELS: Record<string, string> = {
  'triagem': 'Triagem',
  'entrevista': 'Entrevista',
  'aprovado': 'Aprovado',
  'reprovado': 'Reprovado',
  'indicacao_aprovada': 'Indicação Aprovada',
  'enviado_cliente': 'Enviado ao Cliente',
  'aguardando_cliente': 'Aguardando Cliente',
  'entrevista_cliente': 'Entrevista Cliente',
  'aprovado_cliente': 'Aprovado pelo Cliente',
  'reprovado_cliente': 'Reprovado pelo Cliente',
  'contratado': 'Contratado'
};

const ORIGEM_LABELS: Record<string, string> = {
  'aquisicao': 'Aquisição Própria',
  'indicacao_cliente': 'Indicação do Cliente'
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const ExportarCandidaturasModal: React.FC<ExportarCandidaturasModalProps> = ({
  isOpen,
  onClose,
  candidaturas,
  vagas,
  clientes,
  usuarios
}) => {
  // Estados dos filtros
  const [filtroVaga, setFiltroVaga] = useState<string>('todos');
  const [filtroCliente, setFiltroCliente] = useState<string>('todos');
  const [filtroAnalista, setFiltroAnalista] = useState<string>('todos');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [exportando, setExportando] = useState(false);

  // ============================================
  // MAPAS DE LOOKUP
  // ============================================

  const vagasMap = useMemo(() => {
    const map = new Map<string, Vaga>();
    vagas.forEach(v => map.set(String(v.id), v));
    return map;
  }, [vagas]);

  const clientesMap = useMemo(() => {
    const map = new Map<string, string>();
    clientes.forEach(c => {
      map.set(String(c.id), c.razao_social_cliente || c.nome || `Cliente #${c.id}`);
    });
    return map;
  }, [clientes]);

  const usuariosMap = useMemo(() => {
    const map = new Map<string, string>();
    usuarios.forEach(u => {
      map.set(String(u.id), u.nome_usuario || u.nome || `Usuário #${u.id}`);
    });
    return map;
  }, [usuarios]);

  // ============================================
  // LISTAS PARA FILTROS
  // ============================================

  const vagasDisponiveis = useMemo(() => {
    return vagas
      .filter(v => v.titulo)
      .sort((a, b) => a.titulo.localeCompare(b.titulo));
  }, [vagas]);

  const clientesDisponiveis = useMemo(() => {
    return clientes
      .filter(c => c.razao_social_cliente || c.nome)
      .map(c => ({
        id: c.id,
        nome: c.razao_social_cliente || c.nome || ''
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [clientes]);

  const analistasDisponiveis = useMemo(() => {
    // Filtrar apenas analistas de R&S (que têm candidaturas)
    const analistaIds = new Set(candidaturas.map(c => c.analista_id).filter(Boolean));
    return usuarios
      .filter(u => analistaIds.has(Number(u.id)))
      .map(u => ({
        id: u.id,
        nome: u.nome_usuario || u.nome || ''
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [usuarios, candidaturas]);

  const statusDisponiveis = useMemo(() => {
    const statusSet = new Set(candidaturas.map(c => c.status));
    return Array.from(statusSet)
      .filter(s => STATUS_LABELS[s])
      .sort((a, b) => STATUS_LABELS[a].localeCompare(STATUS_LABELS[b]));
  }, [candidaturas]);

  // ============================================
  // CANDIDATURAS FILTRADAS
  // ============================================

  const candidaturasFiltradas = useMemo(() => {
    return candidaturas.filter(c => {
      // Filtro por vaga
      if (filtroVaga !== 'todos' && String(c.vaga_id) !== filtroVaga) return false;
      
      // Filtro por cliente (via vaga)
      if (filtroCliente !== 'todos') {
        const vaga = vagasMap.get(String(c.vaga_id));
        if (!vaga || String(vaga.cliente_id) !== filtroCliente) return false;
      }
      
      // Filtro por analista
      if (filtroAnalista !== 'todos' && String(c.analista_id) !== filtroAnalista) return false;
      
      // Filtro por status
      if (filtroStatus !== 'todos' && c.status !== filtroStatus) return false;
      
      return true;
    });
  }, [candidaturas, filtroVaga, filtroCliente, filtroAnalista, filtroStatus, vagasMap]);

  // ============================================
  // EXPORTAR PARA EXCEL
  // ============================================

  const handleExportar = async () => {
    if (candidaturasFiltradas.length === 0) {
      alert('Nenhuma candidatura encontrada com os filtros selecionados.');
      return;
    }

    setExportando(true);

    try {
      // Preparar dados para exportação
      const dadosExport = candidaturasFiltradas.map(c => {
        const vaga = vagasMap.get(String(c.vaga_id));
        const clienteNome = vaga?.cliente_id ? clientesMap.get(String(vaga.cliente_id)) : '';
        const analistaNome = c.analista_id ? usuariosMap.get(String(c.analista_id)) : '';

        return {
          'Candidato': c.candidato_nome || '',
          'Email': c.candidato_email || '',
          'CPF': c.candidato_cpf || '',
          'Vaga': vaga?.titulo || '',
          'Senioridade': vaga?.senioridade || '',
          'Cliente': clienteNome || '',
          'Analista R&S': analistaNome || '',
          'Status': STATUS_LABELS[c.status] || c.status,
          'Origem': ORIGEM_LABELS[c.origem || 'aquisicao'] || 'Aquisição Própria',
          'Indicado Por': c.indicado_por_nome || '',
          'Cargo Indicador': c.indicado_por_cargo || '',
          'Data Criação': c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : '',
          'Data Atualização': c.atualizado_em ? new Date(c.atualizado_em).toLocaleDateString('pt-BR') : '',
          'Enviado ao Cliente': c.data_envio_cliente ? new Date(c.data_envio_cliente).toLocaleDateString('pt-BR') : '',
          'Feedback Cliente': c.feedback_cliente || '',
          'Observações': c.observacoes || ''
        };
      });

      // Criar workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dadosExport);

      // Ajustar largura das colunas
      const colWidths = [
        { wch: 30 },  // Candidato
        { wch: 35 },  // Email
        { wch: 15 },  // CPF
        { wch: 40 },  // Vaga
        { wch: 12 },  // Senioridade
        { wch: 25 },  // Cliente
        { wch: 25 },  // Analista R&S
        { wch: 20 },  // Status
        { wch: 18 },  // Origem
        { wch: 25 },  // Indicado Por
        { wch: 20 },  // Cargo Indicador
        { wch: 12 },  // Data Criação
        { wch: 14 },  // Data Atualização
        { wch: 14 },  // Enviado ao Cliente
        { wch: 40 },  // Feedback Cliente
        { wch: 50 }   // Observações
      ];
      ws['!cols'] = colWidths;

      // Adicionar worksheet ao workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Candidaturas');

      // Gerar nome do arquivo
      const dataAtual = new Date().toISOString().split('T')[0];
      let nomeArquivo = `Candidaturas_${dataAtual}`;
      
      if (filtroCliente !== 'todos') {
        const clienteNome = clientesMap.get(filtroCliente) || '';
        nomeArquivo += `_${clienteNome.replace(/[^a-zA-Z0-9]/g, '_')}`;
      }
      if (filtroStatus !== 'todos') {
        nomeArquivo += `_${STATUS_LABELS[filtroStatus] || filtroStatus}`;
      }
      
      nomeArquivo += '.xlsx';

      // Download
      XLSX.writeFile(wb, nomeArquivo);

      alert(`✅ Exportação concluída!\n${candidaturasFiltradas.length} candidatura(s) exportada(s).`);
      onClose();

    } catch (error: any) {
      console.error('Erro ao exportar:', error);
      alert(`❌ Erro ao exportar: ${error.message}`);
    } finally {
      setExportando(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8" />
              <div>
                <h2 className="text-xl font-bold">Exportar Candidaturas</h2>
                <p className="text-green-100 text-sm">Gerar relatório em Excel</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="text-white hover:text-green-200 p-2"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-5">
          
          {/* Filtros */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <Filter className="w-5 h-5 text-green-600" />
              Filtros de Exportação
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Filtro Vaga */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <Briefcase className="w-4 h-4" />
                  Vaga
                </label>
                <select
                  value={filtroVaga}
                  onChange={e => setFiltroVaga(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-200"
                >
                  <option value="todos">Todas as Vagas</option>
                  {vagasDisponiveis.map(v => (
                    <option key={v.id} value={v.id}>{v.titulo}</option>
                  ))}
                </select>
              </div>

              {/* Filtro Cliente */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  Cliente
                </label>
                <select
                  value={filtroCliente}
                  onChange={e => setFiltroCliente(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-200"
                >
                  <option value="todos">Todos os Clientes</option>
                  {clientesDisponiveis.map(c => (
                    <option key={c.id} value={String(c.id)}>{c.nome}</option>
                  ))}
                </select>
              </div>

              {/* Filtro Analista R&S */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <User className="w-4 h-4" />
                  Analista R&S
                </label>
                <select
                  value={filtroAnalista}
                  onChange={e => setFiltroAnalista(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-200"
                >
                  <option value="todos">Todos os Analistas</option>
                  {analistasDisponiveis.map(a => (
                    <option key={a.id} value={String(a.id)}>{a.nome}</option>
                  ))}
                </select>
              </div>

              {/* Filtro Status */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Status
                </label>
                <select
                  value={filtroStatus}
                  onChange={e => setFiltroStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-200"
                >
                  <option value="todos">Todos os Status</option>
                  {statusDisponiveis.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-800 font-medium">
                  📊 {candidaturasFiltradas.length} candidatura(s) selecionada(s)
                </p>
                <p className="text-blue-600 text-sm mt-1">
                  {filtroVaga !== 'todos' || filtroCliente !== 'todos' || filtroAnalista !== 'todos' || filtroStatus !== 'todos' 
                    ? 'Filtros aplicados' 
                    : 'Exportando todas as candidaturas'}
                </p>
              </div>
              <FileSpreadsheet className="w-10 h-10 text-blue-400" />
            </div>
          </div>

          {/* Colunas que serão exportadas */}
          <div className="text-sm text-gray-500">
            <p className="font-medium mb-1">Colunas no arquivo:</p>
            <p className="text-xs">
              Candidato, Email, CPF, Vaga, Senioridade, Cliente, Analista R&S, Status, 
              Origem, Indicado Por, Cargo Indicador, Data Criação, Data Atualização, 
              Enviado ao Cliente, Feedback Cliente, Observações
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t">
          <button
            onClick={onClose}
            className="px-5 py-2 text-gray-600 hover:text-gray-800 font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleExportar}
            disabled={exportando || candidaturasFiltradas.length === 0}
            className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-semibold hover:shadow-lg transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportando ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Exportar Excel
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportarCandidaturasModal;
