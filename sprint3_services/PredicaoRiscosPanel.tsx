/**
 * COMPONENTE: PREDIÇÃO DE RISCOS PANEL
 * Exibe predição de risco de reprovação para candidaturas
 * 
 * Integra com predicaoRiscosService
 * 
 * Versão: 1.0
 * Data: 28/12/2024
 */

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp, 
  Target, 
  BookOpen, 
  HelpCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { 
  preverRiscoCandidato, 
  sugerirPreparacaoCandidato,
  gerarAlertasProativos,
  calcularTaxaSucessoPredicoes,
  PredicaoRisco 
} from '../../services/predicaoRiscosService';

interface PredicaoRiscosPanelProps {
  candidaturaId?: number;
  modo?: 'individual' | 'alertas' | 'metricas';
}

const PredicaoRiscosPanel: React.FC<PredicaoRiscosPanelProps> = ({ 
  candidaturaId,
  modo = 'individual'
}) => {
  // Estados
  const [loading, setLoading] = useState(false);
  const [predicao, setPredicao] = useState<PredicaoRisco | null>(null);
  const [preparacao, setPreparacao] = useState<{
    areas_melhorar: string[];
    recursos_estudo: string[];
    questoes_pratica: string[];
  } | null>(null);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [metricas, setMetricas] = useState<{
    total_predicoes: number;
    predicoes_corretas: number;
    taxa_sucesso: number;
  } | null>(null);
  const [expandido, setExpandido] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carregar predição individual
  const carregarPredicao = async () => {
    if (!candidaturaId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const resultado = await preverRiscoCandidato(candidaturaId);
      setPredicao(resultado);
      
      if (resultado && resultado.risco_reprovacao > 30) {
        const prep = await sugerirPreparacaoCandidato(candidaturaId);
        setPreparacao(prep);
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar predição');
    } finally {
      setLoading(false);
    }
  };

  // Carregar alertas proativos
  const carregarAlertas = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const resultado = await gerarAlertasProativos();
      setAlertas(resultado);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar alertas');
    } finally {
      setLoading(false);
    }
  };

  // Carregar métricas
  const carregarMetricas = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const resultado = await calcularTaxaSucessoPredicoes();
      setMetricas(resultado);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar métricas');
    } finally {
      setLoading(false);
    }
  };

  // Carregar dados conforme modo
  useEffect(() => {
    if (modo === 'individual' && candidaturaId) {
      carregarPredicao();
    } else if (modo === 'alertas') {
      carregarAlertas();
    } else if (modo === 'metricas') {
      carregarMetricas();
    }
  }, [modo, candidaturaId]);

  // Cor do nível de risco
  const getCorRisco = (nivel: string) => {
    switch (nivel) {
      case 'Crítico': return 'text-red-600 bg-red-50 border-red-200';
      case 'Alto': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'Médio': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'Baixo': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  // Ícone do nível de risco
  const getIconeRisco = (nivel: string) => {
    switch (nivel) {
      case 'Crítico': return <XCircle className="w-5 h-5" />;
      case 'Alto': return <AlertTriangle className="w-5 h-5" />;
      case 'Médio': return <AlertCircle className="w-5 h-5" />;
      case 'Baixo': return <CheckCircle2 className="w-5 h-5" />;
      default: return <HelpCircle className="w-5 h-5" />;
    }
  };

  // Render modo individual
  const renderIndividual = () => {
    if (!candidaturaId) {
      return (
        <div className="text-center text-gray-500 py-8">
          <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Selecione uma candidatura para ver a predição de risco</p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Analisando risco...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          <AlertTriangle className="w-5 h-5 inline mr-2" />
          {error}
        </div>
      );
    }

    if (!predicao) {
      return (
        <div className="text-center text-gray-500 py-8">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Predição não disponível</p>
          <p className="text-sm mt-1">A funcionalidade pode estar desativada ou não há dados suficientes</p>
          <button 
            onClick={carregarPredicao}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4 inline mr-2" />
            Tentar Novamente
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Card Principal de Risco */}
        <div className={`p-4 rounded-lg border ${getCorRisco(predicao.nivel_risco)}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getIconeRisco(predicao.nivel_risco)}
              <div>
                <h3 className="font-bold">Risco de Reprovação</h3>
                <p className="text-2xl font-bold">{predicao.risco_reprovacao}%</p>
              </div>
            </div>
            <div className="text-right">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                predicao.nivel_risco === 'Crítico' ? 'bg-red-200' :
                predicao.nivel_risco === 'Alto' ? 'bg-orange-200' :
                predicao.nivel_risco === 'Médio' ? 'bg-yellow-200' : 'bg-green-200'
              }`}>
                {predicao.nivel_risco}
              </span>
              <p className="text-sm mt-2">
                {predicao.deve_enviar ? (
                  <span className="text-green-600">✓ Recomendado enviar</span>
                ) : (
                  <span className="text-red-600">✗ Não recomendado</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Motivos de Risco */}
        {predicao.motivos_risco.length > 0 && (
          <div className="bg-white p-4 rounded-lg border">
            <button 
              onClick={() => setExpandido(!expandido)}
              className="flex items-center justify-between w-full text-left"
            >
              <h4 className="font-semibold flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                Motivos de Risco ({predicao.motivos_risco.length})
              </h4>
              {expandido ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
            
            {expandido && (
              <ul className="mt-3 space-y-2">
                {predicao.motivos_risco.map((motivo, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                    <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    {motivo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Recomendações de Preparação */}
        {predicao.recomendacoes_preparacao.length > 0 && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h4 className="font-semibold flex items-center gap-2 text-blue-800 mb-3">
              <TrendingUp className="w-4 h-4" />
              Recomendações de Preparação
            </h4>
            <ul className="space-y-2">
              {predicao.recomendacoes_preparacao.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-blue-700">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recursos de Estudo */}
        {preparacao && preparacao.areas_melhorar.length > 0 && (
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <h4 className="font-semibold flex items-center gap-2 text-purple-800 mb-3">
              <BookOpen className="w-4 h-4" />
              Áreas para Melhorar
            </h4>
            <div className="flex flex-wrap gap-2">
              {preparacao.areas_melhorar.map((area, idx) => (
                <span key={idx} className="px-3 py-1 bg-purple-200 text-purple-800 rounded-full text-sm">
                  {area}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render modo alertas
  const renderAlertas = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      );
    }

    if (alertas.length === 0) {
      return (
        <div className="text-center text-gray-500 py-8">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
          <p>Nenhum alerta de risco no momento</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {alertas.map((alerta, idx) => (
          <div key={idx} className={`p-4 rounded-lg border ${getCorRisco(alerta.nivel_risco)}`}>
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold">{alerta.candidato_nome}</h4>
                <p className="text-sm opacity-80">{alerta.vaga_titulo}</p>
              </div>
              <span className="text-lg font-bold">{alerta.risco_reprovacao}%</span>
            </div>
            {alerta.motivos.length > 0 && (
              <p className="text-sm mt-2 opacity-80">
                {alerta.motivos[0]}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render modo métricas
  const renderMetricas = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      );
    }

    if (!metricas) {
      return (
        <div className="text-center text-gray-500 py-8">
          <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Métricas não disponíveis</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg text-center">
          <p className="text-3xl font-bold text-blue-600">{metricas.total_predicoes}</p>
          <p className="text-sm text-gray-600">Total de Predições</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg text-center">
          <p className="text-3xl font-bold text-green-600">{metricas.predicoes_corretas}</p>
          <p className="text-sm text-gray-600">Predições Corretas</p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg text-center">
          <p className="text-3xl font-bold text-purple-600">{metricas.taxa_sucesso.toFixed(1)}%</p>
          <p className="text-sm text-gray-600">Taxa de Acerto</p>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-600" />
          {modo === 'individual' && 'Predição de Risco'}
          {modo === 'alertas' && 'Alertas de Risco'}
          {modo === 'metricas' && 'Métricas do Modelo'}
        </h2>
        <button 
          onClick={() => {
            if (modo === 'individual') carregarPredicao();
            else if (modo === 'alertas') carregarAlertas();
            else carregarMetricas();
          }}
          className="p-2 hover:bg-gray-100 rounded-lg"
          title="Atualizar"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {modo === 'individual' && renderIndividual()}
      {modo === 'alertas' && renderAlertas()}
      {modo === 'metricas' && renderMetricas()}
    </div>
  );
};

export default PredicaoRiscosPanel;
