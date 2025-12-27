/**
 * RecomendacaoCandidatoPanel.tsx - Painel de Recomendação de Candidatos (RAISA)
 * 
 * Exibe a recomendação da IA sobre um candidato e permite ao analista
 * concordar ou divergir da recomendação.
 * 
 * IMPORTANTE: Este componente é do módulo RAISA para CANDIDATOS.
 * NÃO confundir com o módulo RMS de análise de risco de CONSULTORES.
 * 
 * Versão: 1.0
 * Data: 27/12/2024
 * Sprint: 2 - Integração Recomendação de Candidatos
 */

import React, { useState, useEffect } from 'react';
import { 
  ThumbsUp, 
  ThumbsDown, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  HelpCircle,
  TrendingUp,
  Brain,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Star,
  Shield,
  Target,
  Users,
  Briefcase,
  Loader2
} from 'lucide-react';
import { 
  useRecomendacaoCandidato, 
  RecomendacaoCandidato, 
  DecisaoRecomendacao,
  RedFlag 
} from '@/hooks/supabase/useRecomendacaoCandidato';

// ============================================
// TIPOS
// ============================================

interface RecomendacaoCandidatoPanelProps {
  candidaturaId: number;
  candidatoNome?: string;
  vagaTitulo?: string;
  onDecisaoRegistrada?: (decisao: DecisaoRecomendacao, divergiu: boolean) => void;
  modoCompacto?: boolean;
}

// ============================================
// COMPONENTES AUXILIARES
// ============================================

const ScoreBar: React.FC<{ label: string; score: number; icon: React.ReactNode }> = ({ 
  label, 
  score, 
  icon 
}) => {
  const getColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-blue-500';
    if (s >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-6 text-gray-500">{icon}</div>
      <span className="text-sm text-gray-600 w-28">{label}</span>
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div 
          className={`h-2 rounded-full ${getColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-medium w-10 text-right">{score}%</span>
    </div>
  );
};

const RedFlagItem: React.FC<{ flag: RedFlag }> = ({ flag }) => {
  const getSeverityConfig = (severidade: string) => {
    switch (severidade) {
      case 'critica':
        return { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-800', icon: '🚨' };
      case 'alta':
        return { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800', icon: '⚠️' };
      case 'media':
        return { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-800', icon: '⚡' };
      default:
        return { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-800', icon: 'ℹ️' };
    }
  };

  const config = getSeverityConfig(flag.severidade);

  return (
    <div className={`p-3 rounded-lg border ${config.bg} ${config.border}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg">{config.icon}</span>
        <div className="flex-1">
          <p className={`font-medium ${config.text}`}>{flag.tipo}</p>
          <p className="text-sm text-gray-600">{flag.descricao}</p>
          {flag.evidencia && (
            <p className="text-xs text-gray-500 mt-1 italic">"{flag.evidencia}"</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const RecomendacaoCandidatoPanel: React.FC<RecomendacaoCandidatoPanelProps> = ({
  candidaturaId,
  candidatoNome,
  vagaTitulo,
  onDecisaoRegistrada,
  modoCompacto = false
}) => {
  const { 
    recomendacaoAtual, 
    loading, 
    error,
    loadRecomendacao,
    registrarDecisaoAnalista 
  } = useRecomendacaoCandidato();

  const [expandido, setExpandido] = useState(!modoCompacto);
  const [mostrarJustificativa, setMostrarJustificativa] = useState(false);
  const [justificativaAnalista, setJustificativaAnalista] = useState('');
  const [salvandoDecisao, setSalvandoDecisao] = useState(false);

  // Carregar recomendação ao montar
  useEffect(() => {
    if (candidaturaId) {
      loadRecomendacao(candidaturaId);
    }
  }, [candidaturaId, loadRecomendacao]);

  // Handler para registrar decisão
  const handleDecisao = async (decisao: DecisaoRecomendacao) => {
    if (!recomendacaoAtual) return;

    const divergiu = decisao !== recomendacaoAtual.recomendacao;

    // Se divergiu, pedir justificativa
    if (divergiu && !justificativaAnalista) {
      setMostrarJustificativa(true);
      return;
    }

    setSalvandoDecisao(true);
    
    const sucesso = await registrarDecisaoAnalista(
      recomendacaoAtual.id,
      decisao,
      divergiu ? justificativaAnalista : undefined
    );

    setSalvandoDecisao(false);

    if (sucesso) {
      setMostrarJustificativa(false);
      setJustificativaAnalista('');
      onDecisaoRegistrada?.(decisao, divergiu);
    }
  };

  // Se não há recomendação
  if (!recomendacaoAtual && !loading) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center gap-2 text-gray-500">
          <Brain size={20} />
          <span>Nenhuma recomendação da IA disponível para esta candidatura.</span>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 border shadow-sm">
        <div className="flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="animate-spin" size={24} />
          <span>Carregando recomendação...</span>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="bg-red-50 rounded-lg p-4 border border-red-200">
        <div className="flex items-center gap-2 text-red-700">
          <XCircle size={20} />
          <span>Erro ao carregar recomendação: {error}</span>
        </div>
      </div>
    );
  }

  const rec = recomendacaoAtual!;
  const jaDecidiu = !!rec.decisao_analista;

  // Config baseada na recomendação
  const getRecomendacaoConfig = () => {
    switch (rec.recomendacao) {
      case 'aprovar':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          icon: <ThumbsUp className="text-green-600" size={24} />,
          label: 'Aprovar Candidato',
          labelColor: 'text-green-700'
        };
      case 'rejeitar':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: <ThumbsDown className="text-red-600" size={24} />,
          label: 'Rejeitar Candidato',
          labelColor: 'text-red-700'
        };
      default:
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          icon: <HelpCircle className="text-yellow-600" size={24} />,
          label: 'Reavaliar Candidato',
          labelColor: 'text-yellow-700'
        };
    }
  };

  const config = getRecomendacaoConfig();

  return (
    <div className={`rounded-lg border shadow-sm overflow-hidden ${config.bg} ${config.border}`}>
      {/* Header */}
      <div 
        className="p-4 cursor-pointer"
        onClick={() => setExpandido(!expandido)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="text-purple-600" size={24} />
            <div>
              <h3 className="font-semibold text-gray-800">Recomendação da IA</h3>
              {candidatoNome && (
                <p className="text-sm text-gray-500">Candidato: {candidatoNome}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Badge da recomendação */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${config.bg} ${config.border} border`}>
              {config.icon}
              <span className={`font-semibold ${config.labelColor}`}>{config.label}</span>
            </div>

            {/* Score de confiança */}
            <div className="flex items-center gap-1 px-3 py-1 bg-white rounded-full border">
              <TrendingUp size={16} className="text-blue-600" />
              <span className="font-semibold text-gray-700">{rec.score_confianca}%</span>
              <span className="text-xs text-gray-500">confiança</span>
            </div>

            {/* Botão expandir */}
            <button className="p-1 hover:bg-white/50 rounded">
              {expandido ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          </div>
        </div>

        {/* Status da decisão do analista */}
        {jaDecidiu && (
          <div className="mt-3 flex items-center gap-2">
            {rec.seguiu_recomendacao ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-sm">
                <CheckCircle size={14} />
                Analista concordou
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-sm">
                <AlertTriangle size={14} />
                Analista divergiu
              </span>
            )}
            <span className="text-sm text-gray-500">
              Decisão: <strong>{rec.decisao_analista}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Conteúdo expandido */}
      {expandido && (
        <div className="border-t border-gray-200 bg-white p-4 space-y-4">
          {/* Justificativa da IA */}
          <div>
            <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
              <MessageSquare size={16} />
              Justificativa da IA
            </h4>
            <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">{rec.justificativa}</p>
          </div>

          {/* Scores detalhados */}
          {(rec.score_tecnico || rec.score_comportamental || rec.score_cultural || rec.score_experiencia) && (
            <div>
              <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Target size={16} />
                Scores Detalhados
              </h4>
              <div className="space-y-2">
                {rec.score_tecnico && (
                  <ScoreBar 
                    label="Técnico" 
                    score={rec.score_tecnico} 
                    icon={<Shield size={14} />} 
                  />
                )}
                {rec.score_experiencia && (
                  <ScoreBar 
                    label="Experiência" 
                    score={rec.score_experiencia} 
                    icon={<Briefcase size={14} />} 
                  />
                )}
                {rec.score_comportamental && (
                  <ScoreBar 
                    label="Comportamental" 
                    score={rec.score_comportamental} 
                    icon={<Users size={14} />} 
                  />
                )}
                {rec.score_cultural && (
                  <ScoreBar 
                    label="Fit Cultural" 
                    score={rec.score_cultural} 
                    icon={<Star size={14} />} 
                  />
                )}
              </div>
            </div>
          )}

          {/* Probabilidade de aprovação */}
          {rec.probabilidade_aprovacao_cliente && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <TrendingUp className="text-blue-600" size={20} />
              <div>
                <span className="text-sm text-gray-600">Probabilidade de aprovação pelo cliente:</span>
                <span className="ml-2 font-bold text-blue-700">{rec.probabilidade_aprovacao_cliente}%</span>
              </div>
            </div>
          )}

          {/* Pontos fortes */}
          {rec.pontos_fortes && rec.pontos_fortes.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                <CheckCircle size={16} className="text-green-600" />
                Pontos Fortes
              </h4>
              <ul className="space-y-1">
                {rec.pontos_fortes.map((ponto, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-gray-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    {ponto}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Red Flags */}
          {rec.red_flags && rec.red_flags.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600" />
                Red Flags ({rec.red_flags.length})
              </h4>
              <div className="space-y-2">
                {rec.red_flags.map((flag, idx) => (
                  <RedFlagItem key={idx} flag={flag} />
                ))}
              </div>
            </div>
          )}

          {/* Ações do analista */}
          {!jaDecidiu && (
            <div className="border-t pt-4">
              <h4 className="font-medium text-gray-700 mb-3">Sua Decisão:</h4>
              
              {mostrarJustificativa ? (
                <div className="space-y-3">
                  <p className="text-sm text-orange-600">
                    Você está divergindo da recomendação da IA. Por favor, justifique:
                  </p>
                  <textarea
                    value={justificativaAnalista}
                    onChange={e => setJustificativaAnalista(e.target.value)}
                    className="w-full p-3 border rounded-lg resize-none"
                    rows={3}
                    placeholder="Explique o motivo da divergência..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMostrarJustificativa(false)}
                      className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleDecisao(rec.recomendacao === 'aprovar' ? 'rejeitar' : 'aprovar')}
                      disabled={!justificativaAnalista.trim() || salvandoDecisao}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                    >
                      {salvandoDecisao ? 'Salvando...' : 'Confirmar Divergência'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleDecisao('aprovar')}
                    disabled={salvandoDecisao}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors ${
                      rec.recomendacao === 'aprovar'
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-white border-2 border-green-600 text-green-600 hover:bg-green-50'
                    }`}
                  >
                    <ThumbsUp size={20} />
                    Aprovar
                    {rec.recomendacao === 'aprovar' && <span className="text-xs">(recomendado)</span>}
                  </button>
                  
                  <button
                    onClick={() => handleDecisao('rejeitar')}
                    disabled={salvandoDecisao}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors ${
                      rec.recomendacao === 'rejeitar'
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-white border-2 border-red-600 text-red-600 hover:bg-red-50'
                    }`}
                  >
                    <ThumbsDown size={20} />
                    Rejeitar
                    {rec.recomendacao === 'rejeitar' && <span className="text-xs">(recomendado)</span>}
                  </button>

                  <button
                    onClick={() => handleDecisao('reavaliar')}
                    disabled={salvandoDecisao}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-yellow-600 text-yellow-600 rounded-lg hover:bg-yellow-50"
                  >
                    <HelpCircle size={20} />
                    Reavaliar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Justificativa do analista (se divergiu) */}
          {jaDecidiu && rec.justificativa_analista && (
            <div className="border-t pt-4">
              <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                <MessageSquare size={16} />
                Justificativa do Analista
              </h4>
              <p className="text-gray-600 bg-orange-50 p-3 rounded-lg border border-orange-200">
                {rec.justificativa_analista}
              </p>
            </div>
          )}

          {/* Metadados */}
          <div className="text-xs text-gray-400 pt-2 border-t flex justify-between">
            <span>Gerada em: {new Date(rec.gerada_em).toLocaleString('pt-BR')}</span>
            <span>Por: {rec.gerada_por}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecomendacaoCandidatoPanel;
