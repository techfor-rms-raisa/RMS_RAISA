/**
 * AnaliseCVPanel.tsx - Painel de Análise de CV com IA
 * 
 * Componente que exibe a análise de currículo feita pela IA
 * com contexto da vaga específica
 * 
 * Versão: 1.0
 * Data: 06/01/2026
 */

import React, { useState, useEffect } from 'react';
import {
  Brain, AlertTriangle, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronUp, Sparkles, Target, Shield,
  ThumbsUp, ThumbsDown, Loader2, RefreshCw, HelpCircle,
  Award, AlertCircle, TrendingUp, TrendingDown, Zap
} from 'lucide-react';
import { AnaliseCV, FatorRisco } from '@/hooks/supabase/useCandidaturaAnaliseIA';

// ============================================
// TIPOS
// ============================================

interface AnaliseCVPanelProps {
  analise: AnaliseCV | null;
  loading: boolean;
  error: string | null;
  onAnalisar: () => void;
  onFeedback?: (util: boolean, texto?: string) => void;
  curriculoDisponivel: boolean;
}

// ============================================
// CONFIGURAÇÕES
// ============================================

const NIVEL_RISCO_CONFIG = {
  'Baixo': { cor: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle },
  'Médio': { cor: 'text-yellow-600', bg: 'bg-yellow-100', icon: AlertCircle },
  'Alto': { cor: 'text-orange-600', bg: 'bg-orange-100', icon: AlertTriangle },
  'Crítico': { cor: 'text-red-600', bg: 'bg-red-100', icon: XCircle }
};

const RECOMENDACAO_CONFIG = {
  'aprovar': { label: 'Aprovar', cor: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
  'entrevistar': { label: 'Entrevistar', cor: 'text-blue-700', bg: 'bg-blue-100', icon: Target },
  'revisar': { label: 'Revisar', cor: 'text-yellow-700', bg: 'bg-yellow-100', icon: AlertCircle },
  'rejeitar': { label: 'Rejeitar', cor: 'text-red-700', bg: 'bg-red-100', icon: XCircle }
};

const TIPO_RISCO_LABELS: Record<string, string> = {
  'job_hopping': 'Job Hopping',
  'gap_emprego': 'Gap de Emprego',
  'skills_desatualizadas': 'Skills Desatualizadas',
  'senioridade_inadequada': 'Senioridade Inadequada',
  'experiencia_insuficiente': 'Experiência Insuficiente',
  'formacao_inadequada': 'Formação Inadequada',
  'inconsistencias': 'Inconsistências no CV'
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function AnaliseCVPanel({
  analise,
  loading,
  error,
  onAnalisar,
  onFeedback,
  curriculoDisponivel
}: AnaliseCVPanelProps) {
  const [expandido, setExpandido] = useState(true);
  const [secaoExpandida, setSecaoExpandida] = useState<string | null>('resumo');
  const [feedbackEnviado, setFeedbackEnviado] = useState(false);

  // Reset feedback quando análise mudar
  useEffect(() => {
    setFeedbackEnviado(false);
  }, [analise?.id]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleFeedback = (util: boolean) => {
    if (onFeedback && !feedbackEnviado) {
      onFeedback(util);
      setFeedbackEnviado(true);
    }
  };

  const toggleSecao = (secao: string) => {
    setSecaoExpandida(secaoExpandida === secao ? null : secao);
  };

  // ============================================
  // RENDER: Estado sem currículo
  // ============================================

  if (!curriculoDisponivel) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gray-200 rounded-lg">
            <Brain className="w-6 h-6 text-gray-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-700">Análise de CV com IA</h3>
            <p className="text-sm text-gray-500">Powered by Gemini 2.0</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">Currículo não disponível</p>
            <p className="text-xs text-yellow-600">
              O texto do currículo não foi extraído para esta candidatura.
              Faça upload do CV ou cole o texto manualmente.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: Estado de carregamento
  // ============================================

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg animate-pulse">
            <Brain className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-purple-700">Analisando CV com IA...</h3>
            <p className="text-sm text-purple-500">Isso pode levar alguns segundos</p>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-purple-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Extraindo informações do currículo...</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-purple-500">
            <Clock className="w-4 h-4" />
            <span>Comparando com requisitos da vaga...</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-purple-400">
            <Target className="w-4 h-4" />
            <span>Identificando fatores de risco...</span>
          </div>
        </div>
        
        <div className="mt-4 h-2 bg-purple-100 rounded-full overflow-hidden">
          <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: Estado de erro
  // ============================================

  if (error) {
    return (
      <div className="bg-red-50 rounded-xl p-6 border border-red-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 rounded-lg">
            <XCircle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-red-700">Erro na Análise</h3>
            <p className="text-sm text-red-500">{error}</p>
          </div>
        </div>
        
        <button
          onClick={onAnalisar}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Tentar Novamente
        </button>
      </div>
    );
  }

  // ============================================
  // RENDER: Sem análise (botão para analisar)
  // ============================================

  if (!analise) {
    return (
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Brain className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-purple-700">Análise de CV com IA</h3>
            <p className="text-sm text-purple-500">Powered by Gemini 2.0 Flash</p>
          </div>
        </div>
        
        <p className="text-sm text-gray-600 mb-4">
          Analise o currículo do candidato em relação aos requisitos desta vaga.
          A IA identificará compatibilidade, riscos e pontos de atenção.
        </p>
        
        <div className="grid grid-cols-2 gap-3 mb-4 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-500" />
            <span>Score de compatibilidade</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-500" />
            <span>Análise de riscos</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-500" />
            <span>Skills match</span>
          </div>
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-purple-500" />
            <span>Perguntas sugeridas</span>
          </div>
        </div>
        
        <button
          onClick={onAnalisar}
          className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition flex items-center justify-center gap-2 font-medium shadow-lg"
        >
          <Sparkles className="w-5 h-5" />
          Analisar CV com IA
        </button>
      </div>
    );
  }

  // ============================================
  // RENDER: Análise completa
  // ============================================

  const nivelConfig = NIVEL_RISCO_CONFIG[analise.nivel_risco] || NIVEL_RISCO_CONFIG['Médio'];
  const recomConfig = RECOMENDACAO_CONFIG[analise.recomendacao] || RECOMENDACAO_CONFIG['revisar'];
  const NivelIcon = nivelConfig.icon;
  const RecomIcon = recomConfig.icon;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div 
        className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 cursor-pointer"
        onClick={() => setExpandido(!expandido)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Brain className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-purple-700 flex items-center gap-2">
                Análise de CV com IA
                <span className="text-xs font-normal px-2 py-0.5 bg-purple-200 text-purple-700 rounded-full">
                  {analise.modelo_ia}
                </span>
              </h3>
              <p className="text-xs text-purple-500">
                Confiança: {analise.confianca_analise}% • 
                {analise.tempo_analise_ms && ` ${(analise.tempo_analise_ms / 1000).toFixed(1)}s`}
                {analise.criado_em && ` • ${new Date(analise.criado_em).toLocaleDateString('pt-BR')}`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Score de Compatibilidade */}
            <div className="text-center">
              <div className={`text-2xl font-bold ${
                analise.score_compatibilidade >= 70 ? 'text-green-600' :
                analise.score_compatibilidade >= 50 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {analise.score_compatibilidade}%
              </div>
              <div className="text-xs text-gray-500">Match</div>
            </div>
            
            {expandido ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo expandido */}
      {expandido && (
        <div className="p-4 space-y-4">
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 gap-3">
            {/* Recomendação */}
            <div className={`${recomConfig.bg} rounded-lg p-3 border`}>
              <div className="flex items-center gap-2 mb-1">
                <RecomIcon className={`w-5 h-5 ${recomConfig.cor}`} />
                <span className={`font-semibold ${recomConfig.cor}`}>{recomConfig.label}</span>
              </div>
              <p className="text-xs text-gray-600">Recomendação da IA</p>
            </div>
            
            {/* Risco */}
            <div className={`${nivelConfig.bg} rounded-lg p-3 border`}>
              <div className="flex items-center gap-2 mb-1">
                <NivelIcon className={`w-5 h-5 ${nivelConfig.cor}`} />
                <span className={`font-semibold ${nivelConfig.cor}`}>Risco {analise.nivel_risco}</span>
              </div>
              <p className="text-xs text-gray-600">{analise.risco_reprovacao}% chance de reprovação</p>
            </div>
          </div>

          {/* Justificativa */}
          {analise.justificativa && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-700">{analise.justificativa}</p>
            </div>
          )}

          {/* Seções colapsáveis */}
          <div className="space-y-2">
            {/* Pontos Fortes */}
            {analise.pontos_fortes.length > 0 && (
              <SecaoColapsavel
                titulo="Pontos Fortes"
                icon={<TrendingUp className="w-4 h-4 text-green-600" />}
                cor="green"
                expandida={secaoExpandida === 'fortes'}
                onToggle={() => toggleSecao('fortes')}
              >
                <ul className="space-y-1">
                  {analise.pontos_fortes.map((ponto, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{ponto}</span>
                    </li>
                  ))}
                </ul>
              </SecaoColapsavel>
            )}

            {/* Fatores de Risco */}
            {analise.fatores_risco.length > 0 && (
              <SecaoColapsavel
                titulo={`Fatores de Risco (${analise.fatores_risco.length})`}
                icon={<AlertTriangle className="w-4 h-4 text-orange-600" />}
                cor="orange"
                expandida={secaoExpandida === 'riscos'}
                onToggle={() => toggleSecao('riscos')}
              >
                <div className="space-y-2">
                  {analise.fatores_risco.map((risco, idx) => (
                    <FatorRiscoCard key={idx} risco={risco} />
                  ))}
                </div>
              </SecaoColapsavel>
            )}

            {/* Pontos de Atenção */}
            {analise.pontos_atencao.length > 0 && (
              <SecaoColapsavel
                titulo="Pontos de Atenção"
                icon={<AlertCircle className="w-4 h-4 text-yellow-600" />}
                cor="yellow"
                expandida={secaoExpandida === 'atencao'}
                onToggle={() => toggleSecao('atencao')}
              >
                <ul className="space-y-1">
                  {analise.pontos_atencao.map((ponto, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <span>{ponto}</span>
                    </li>
                  ))}
                </ul>
              </SecaoColapsavel>
            )}

            {/* Skills Match */}
            {analise.skills_match && (
              <SecaoColapsavel
                titulo="Análise de Skills"
                icon={<Zap className="w-4 h-4 text-blue-600" />}
                cor="blue"
                expandida={secaoExpandida === 'skills'}
                onToggle={() => toggleSecao('skills')}
              >
                <div className="space-y-3">
                  {analise.skills_match.atendidas.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-green-600 mb-1">✅ Skills Atendidas</p>
                      <div className="flex flex-wrap gap-1">
                        {analise.skills_match.atendidas.map((skill, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {analise.skills_match.parciais.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-yellow-600 mb-1">⚡ Skills Parciais</p>
                      <div className="flex flex-wrap gap-1">
                        {analise.skills_match.parciais.map((skill, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {analise.skills_match.faltantes.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-600 mb-1">❌ Skills Faltantes</p>
                      <div className="flex flex-wrap gap-1">
                        {analise.skills_match.faltantes.map((skill, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SecaoColapsavel>
            )}

            {/* Perguntas para Entrevista */}
            {analise.perguntas_entrevista && analise.perguntas_entrevista.length > 0 && (
              <SecaoColapsavel
                titulo="Perguntas Sugeridas para Entrevista"
                icon={<HelpCircle className="w-4 h-4 text-purple-600" />}
                cor="purple"
                expandida={secaoExpandida === 'perguntas'}
                onToggle={() => toggleSecao('perguntas')}
              >
                <ol className="space-y-2 list-decimal list-inside">
                  {analise.perguntas_entrevista.map((pergunta, idx) => (
                    <li key={idx} className="text-sm text-gray-700">
                      {pergunta}
                    </li>
                  ))}
                </ol>
              </SecaoColapsavel>
            )}
          </div>

          {/* Feedback e ações */}
          <div className="flex items-center justify-between pt-3 border-t">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Esta análise foi útil?</span>
              {feedbackEnviado ? (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Obrigado pelo feedback!
                </span>
              ) : (
                <>
                  <button
                    onClick={() => handleFeedback(true)}
                    className="p-1.5 hover:bg-green-100 rounded transition"
                    title="Útil"
                  >
                    <ThumbsUp className="w-4 h-4 text-gray-400 hover:text-green-600" />
                  </button>
                  <button
                    onClick={() => handleFeedback(false)}
                    className="p-1.5 hover:bg-red-100 rounded transition"
                    title="Não útil"
                  >
                    <ThumbsDown className="w-4 h-4 text-gray-400 hover:text-red-600" />
                  </button>
                </>
              )}
            </div>
            
            <button
              onClick={onAnalisar}
              className="px-3 py-1.5 text-xs text-purple-600 hover:bg-purple-50 rounded-lg transition flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Reanalisar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// COMPONENTES AUXILIARES
// ============================================

interface SecaoColapsavelProps {
  titulo: string;
  icon: React.ReactNode;
  cor: 'green' | 'orange' | 'yellow' | 'blue' | 'purple' | 'red';
  expandida: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function SecaoColapsavel({ titulo, icon, cor, expandida, onToggle, children }: SecaoColapsavelProps) {
  const cores = {
    green: 'border-green-200 bg-green-50',
    orange: 'border-orange-200 bg-orange-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    blue: 'border-blue-200 bg-blue-50',
    purple: 'border-purple-200 bg-purple-50',
    red: 'border-red-200 bg-red-50'
  };

  return (
    <div className={`rounded-lg border ${cores[cor]} overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/50 transition"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-gray-700">{titulo}</span>
        </div>
        {expandida ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>
      
      {expandida && (
        <div className="px-3 pb-3 pt-1 bg-white/50">
          {children}
        </div>
      )}
    </div>
  );
}

interface FatorRiscoCardProps {
  risco: FatorRisco;
}

function FatorRiscoCard({ risco }: FatorRiscoCardProps) {
  const nivelCores = {
    low: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    medium: 'bg-orange-100 text-orange-700 border-orange-300',
    high: 'bg-red-100 text-red-700 border-red-300',
    critical: 'bg-red-200 text-red-800 border-red-400'
  };

  const nivelLabels = {
    low: 'Baixo',
    medium: 'Médio',
    high: 'Alto',
    critical: 'Crítico'
  };

  return (
    <div className="bg-white rounded-lg p-3 border border-orange-200">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-gray-800">
          {TIPO_RISCO_LABELS[risco.tipo] || risco.tipo}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded border ${nivelCores[risco.nivel]}`}>
          {nivelLabels[risco.nivel]}
        </span>
      </div>
      
      <p className="text-sm text-gray-600 mb-1">{risco.descricao}</p>
      
      {risco.evidencia && (
        <p className="text-xs text-gray-500 italic border-l-2 border-orange-300 pl-2 mt-2">
          "{risco.evidencia}"
        </p>
      )}
    </div>
  );
}

export default AnaliseCVPanel;
