/**
 * COMPONENTE: EXPORT MODULE
 * Permite exportar dados do sistema em diferentes formatos
 * 
 * Funcionalidades:
 * - Exportar consultores (CSV/Excel)
 * - Exportar clientes (CSV/Excel)
 * - Exportar vagas (CSV/Excel)
 * - Exportar relatórios de performance
 * 
 * Versão: 2.0
 * Data: 28/12/2024
 */

import React, { useState } from 'react';
import { 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Users, 
  Building2, 
  Briefcase,
  BarChart3,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../config/supabase';

interface ExportOption {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  table: string;
  columns: string[];
  filename: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: 'consultores',
    label: 'Consultores',
    description: 'Lista completa de consultores com dados de contato e status',
    icon: Users,
    table: 'consultants',
    columns: ['id', 'nome', 'email', 'telefone', 'cargo', 'cliente_nome', 'status', 'data_inicio', 'observacoes'],
    filename: 'consultores'
  },
  {
    id: 'clientes',
    label: 'Clientes',
    description: 'Lista de clientes com informações de contato',
    icon: Building2,
    table: 'clients',
    columns: ['id', 'nome_cliente', 'cnpj', 'segmento', 'contato_principal', 'email_contato', 'telefone', 'ativo', 'vip'],
    filename: 'clientes'
  },
  {
    id: 'vagas',
    label: 'Vagas',
    description: 'Todas as vagas com status e informações',
    icon: Briefcase,
    table: 'vagas',
    columns: ['id', 'titulo', 'cliente_id', 'status', 'status_workflow', 'urgente', 'prazo_fechamento', 'faturamento_mensal', 'criado_em'],
    filename: 'vagas'
  },
  {
    id: 'candidaturas',
    label: 'Candidaturas',
    description: 'Histórico de candidaturas e status',
    icon: FileText,
    table: 'candidaturas',
    columns: ['id', 'vaga_id', 'pessoa_id', 'status', 'score_match', 'enviado_em', 'decidido_em', 'decisao'],
    filename: 'candidaturas'
  },
  {
    id: 'performance_analistas',
    label: 'Performance Analistas',
    description: 'Métricas de performance dos analistas de R&S',
    icon: BarChart3,
    table: 'vw_performance_analista',
    columns: ['analista_id', 'analista_nome', 'vagas_ativas', 'total_candidaturas', 'aprovacoes', 'taxa_aprovacao'],
    filename: 'performance_analistas'
  }
];

const ExportModule: React.FC = () => {
  const [exportando, setExportando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [formato, setFormato] = useState<'csv' | 'json'>('csv');

  const exportarDados = async (option: ExportOption) => {
    setExportando(option.id);
    setMensagem(null);

    try {
      // Buscar dados do Supabase
      const { data, error } = await supabase
        .from(option.table)
        .select(option.columns.join(','))
        .limit(10000);

      if (error) throw error;

      if (!data || data.length === 0) {
        setMensagem({ tipo: 'erro', texto: 'Nenhum dado encontrado para exportar.' });
        return;
      }

      let content: string;
      let mimeType: string;
      let extension: string;

      if (formato === 'csv') {
        // Gerar CSV
        const headers = option.columns.join(';');
        const rows = data.map(row => 
          option.columns.map(col => {
            const value = row[col];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string' && value.includes(';')) return `"${value}"`;
            return String(value);
          }).join(';')
        );
        content = [headers, ...rows].join('\n');
        mimeType = 'text/csv;charset=utf-8';
        extension = 'csv';
      } else {
        // Gerar JSON
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        extension = 'json';
      }

      // Criar e baixar arquivo
      const blob = new Blob(['\ufeff' + content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${option.filename}_${new Date().toISOString().split('T')[0]}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setMensagem({ 
        tipo: 'sucesso', 
        texto: `${data.length} registros exportados com sucesso!` 
      });

      console.log(`✅ Exportado: ${option.label} - ${data.length} registros`);

    } catch (error: any) {
      console.error('❌ Erro ao exportar:', error);
      setMensagem({ 
        tipo: 'erro', 
        texto: error.message || 'Erro ao exportar dados.' 
      });
    } finally {
      setExportando(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Exportação de Dados</h2>
          <p className="text-gray-600 mt-1">Exporte dados do sistema em diferentes formatos</p>
        </div>
        
        {/* Seletor de Formato */}
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setFormato('csv')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              formato === 'csv' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 inline mr-2" />
            CSV
          </button>
          <button
            onClick={() => setFormato('json')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              formato === 'json' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            JSON
          </button>
        </div>
      </div>

      {/* Mensagem */}
      {mensagem && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          mensagem.tipo === 'sucesso' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {mensagem.tipo === 'sucesso' 
            ? <CheckCircle className="w-5 h-5" /> 
            : <AlertCircle className="w-5 h-5" />
          }
          {mensagem.texto}
        </div>
      )}

      {/* Grid de Opções */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {EXPORT_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isExporting = exportando === option.id;

          return (
            <div
              key={option.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {option.label}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {option.description}
              </p>

              <div className="text-xs text-gray-500 mb-4">
                <span className="font-medium">Colunas:</span>{' '}
                {option.columns.slice(0, 4).join(', ')}
                {option.columns.length > 4 && ` +${option.columns.length - 4}`}
              </div>

              <button
                onClick={() => exportarDados(option)}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Exportar {formato.toUpperCase()}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
        <p>
          <strong>Dica:</strong> Os arquivos CSV podem ser abertos diretamente no Excel. 
          Use o formato JSON para integrações com outros sistemas.
        </p>
      </div>
    </div>
  );
};

export default ExportModule;