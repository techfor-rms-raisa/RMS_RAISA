/**
 * ScoreCompatibilidadeCircle.tsx - Visualização de Score de Compatibilidade
 * 
 * Componente visual que exibe o score de compatibilidade em formato circular
 * com cores e animações baseadas no nível de compatibilidade.
 * 
 * Versão: 1.0
 * Data: 30/12/2025
 */

import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle } from 'lucide-react';

// ============================================
// TIPOS
// ============================================

interface ScoreCompatibilidadeCircleProps {
  score: number;
  tamanho?: 'sm' | 'md' | 'lg' | 'xl';
  mostrarLabel?: boolean;
  mostrarDetalhes?: boolean;
  detalhes?: {
    skills: number;
    experiencia: number;
    senioridade: number;
    salario?: number;
  };
  recomendacao?: 'MUITO_COMPATIVEL' | 'COMPATIVEL' | 'PARCIALMENTE_COMPATIVEL' | 'INCOMPATIVEL';
  animado?: boolean;
}

// ============================================
// CONFIGURAÇÕES DE TAMANHO
// ============================================

const tamanhoConfig = {
  sm: {
    container: 'w-20 h-20',
    circle: 80,
    strokeWidth: 6,
    fontSize: 'text-lg',
    labelSize: 'text-xs'
  },
  md: {
    container: 'w-32 h-32',
    circle: 128,
    strokeWidth: 8,
    fontSize: 'text-2xl',
    labelSize: 'text-sm'
  },
  lg: {
    container: 'w-40 h-40',
    circle: 160,
    strokeWidth: 10,
    fontSize: 'text-4xl',
    labelSize: 'text-base'
  },
  xl: {
    container: 'w-48 h-48',
    circle: 192,
    strokeWidth: 12,
    fontSize: 'text-5xl',
    labelSize: 'text-lg'
  }
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const ScoreCompatibilidadeCircle: React.FC<ScoreCompatibilidadeCircleProps> = ({
  score,
  tamanho = 'lg',
  mostrarLabel = true,
  mostrarDetalhes = false,
  detalhes,
  recomendacao,
  animado = true
}) => {
  const config = tamanhoConfig[tamanho];
  const radius = (config.circle - config.strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  // Determinar cor baseado no score
  const getScoreColor = () => {
    if (score >= 80) return { bg: 'from-green-400 to-emerald-500', stroke: '#10b981', text: 'text-green-600' };
    if (score >= 60) return { bg: 'from-yellow-400 to-amber-500', stroke: '#f59e0b', text: 'text-yellow-600' };
    if (score >= 40) return { bg: 'from-orange-400 to-orange-500', stroke: '#f97316', text: 'text-orange-600' };
    return { bg: 'from-red-400 to-red-500', stroke: '#ef4444', text: 'text-red-600' };
  };

  const colors = getScoreColor();

  // Determinar label baseado no score ou recomendação
  const getLabel = () => {
    if (recomendacao) {
      switch (recomendacao) {
        case 'MUITO_COMPATIVEL': return { texto: 'MUITO COMPATÍVEL', icon: CheckCircle, cor: 'text-green-600' };
        case 'COMPATIVEL': return { texto: 'COMPATÍVEL', icon: CheckCircle, cor: 'text-green-500' };
        case 'PARCIALMENTE_COMPATIVEL': return { texto: 'PARCIAL', icon: AlertTriangle, cor: 'text-yellow-600' };
        case 'INCOMPATIVEL': return { texto: 'INCOMPATÍVEL', icon: XCircle, cor: 'text-red-600' };
      }
    }
    if (score >= 80) return { texto: 'EXCELENTE', icon: CheckCircle, cor: 'text-green-600' };
    if (score >= 60) return { texto: 'BOM', icon: CheckCircle, cor: 'text-yellow-600' };
    if (score >= 40) return { texto: 'REGULAR', icon: AlertTriangle, cor: 'text-orange-600' };
    return { texto: 'BAIXO', icon: XCircle, cor: 'text-red-600' };
  };

  const label = getLabel();
  const LabelIcon = label.icon;

  return (
    <div className="flex flex-col items-center">
      {/* Círculo Principal */}
      <div className={`relative ${config.container}`}>
        {/* SVG do círculo */}
        <svg
          className="transform -rotate-90"
          width={config.circle}
          height={config.circle}
        >
          {/* Círculo de fundo */}
          <circle
            cx={config.circle / 2}
            cy={config.circle / 2}
            r={radius}
            fill="transparent"
            stroke="#e5e7eb"
            strokeWidth={config.strokeWidth}
          />
          
          {/* Círculo de progresso */}
          <circle
            cx={config.circle / 2}
            cy={config.circle / 2}
            r={radius}
            fill="transparent"
            stroke={colors.stroke}
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animado ? strokeDashoffset : circumference}
            className={animado ? 'transition-all duration-1000 ease-out' : ''}
            style={animado ? { 
              strokeDashoffset: strokeDashoffset,
              transition: 'stroke-dashoffset 1s ease-out'
            } : undefined}
          />
        </svg>

        {/* Conteúdo Central */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold ${config.fontSize} ${colors.text}`}>
            {score}%
          </span>
          {mostrarLabel && (
            <span className={`${config.labelSize} text-gray-500 font-medium`}>
              Score
            </span>
          )}
        </div>
      </div>

      {/* Label de Recomendação */}
      {mostrarLabel && (
        <div className={`mt-3 flex items-center gap-1 ${label.cor}`}>
          <LabelIcon className="w-4 h-4" />
          <span className="font-semibold text-sm">{label.texto}</span>
        </div>
      )}

      {/* Detalhes Expandidos */}
      {mostrarDetalhes && detalhes && (
        <div className="mt-4 w-full max-w-xs space-y-2">
          <BarraProgresso label="Skills" valor={detalhes.skills} cor="bg-blue-500" />
          <BarraProgresso label="Experiência" valor={detalhes.experiencia} cor="bg-purple-500" />
          <BarraProgresso label="Senioridade" valor={detalhes.senioridade} cor="bg-indigo-500" />
          {detalhes.salario !== undefined && (
            <BarraProgresso label="Salário" valor={detalhes.salario} cor="bg-emerald-500" />
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// COMPONENTE: BARRA DE PROGRESSO
// ============================================

interface BarraProgressoProps {
  label: string;
  valor: number;
  cor: string;
}

const BarraProgresso: React.FC<BarraProgressoProps> = ({ label, valor, cor }) => {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 w-24">{label}</span>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full ${cor} rounded-full transition-all duration-500`}
          style={{ width: `${valor}%` }}
        />
      </div>
      <span className="text-xs text-gray-700 font-medium w-8 text-right">{valor}%</span>
    </div>
  );
};

// ============================================
// COMPONENTE: BADGE DE SCORE COMPACTO
// ============================================

interface ScoreBadgeProps {
  score: number;
  tamanho?: 'sm' | 'md' | 'lg';
}

export const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score, tamanho = 'md' }) => {
  const getColor = () => {
    if (score >= 80) return 'bg-green-100 text-green-700 border-green-300';
    if (score >= 60) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    if (score >= 40) return 'bg-orange-100 text-orange-700 border-orange-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const getSize = () => {
    switch (tamanho) {
      case 'sm': return 'px-2 py-0.5 text-xs';
      case 'md': return 'px-3 py-1 text-sm';
      case 'lg': return 'px-4 py-2 text-base';
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 font-bold rounded-full border ${getColor()} ${getSize()}`}>
      {score >= 80 ? '🥇' : score >= 60 ? '🥈' : score >= 40 ? '🥉' : '⚠️'} {score}%
    </span>
  );
};

// ============================================
// COMPONENTE: CARD DE SCORE COMPLETO
// ============================================

interface ScoreCardProps {
  score: number;
  skillsMatch: string[];
  skillsFaltantes: string[];
  skillsExtras: string[];
  justificativa: string;
  recomendacao: 'MUITO_COMPATIVEL' | 'COMPATIVEL' | 'PARCIALMENTE_COMPATIVEL' | 'INCOMPATIVEL';
  detalhes?: {
    skills: number;
    experiencia: number;
    senioridade: number;
    salario?: number;
  };
}

export const ScoreCard: React.FC<ScoreCardProps> = ({
  score,
  skillsMatch,
  skillsFaltantes,
  skillsExtras,
  justificativa,
  recomendacao,
  detalhes
}) => {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-6">
      <div className="flex gap-8">
        {/* Score Visual */}
        <div className="flex-shrink-0">
          <ScoreCompatibilidadeCircle
            score={score}
            tamanho="lg"
            mostrarLabel={true}
            mostrarDetalhes={true}
            detalhes={detalhes}
            recomendacao={recomendacao}
          />
        </div>

        {/* Detalhes */}
        <div className="flex-1 space-y-4">
          {/* Skills Match */}
          {skillsMatch.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-green-600 mb-2 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Skills Compatíveis ({skillsMatch.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {skillsMatch.map((skill, i) => (
                  <span key={i} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">
                    {skill} ✓
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Skills Faltantes */}
          {skillsFaltantes.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-1">
                <XCircle className="w-4 h-4" /> Skills Faltantes ({skillsFaltantes.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {skillsFaltantes.map((skill, i) => (
                  <span key={i} className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Skills Extras */}
          {skillsExtras.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-blue-600 mb-2 flex items-center gap-1">
                <HelpCircle className="w-4 h-4" /> Skills Extras ({skillsExtras.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {skillsExtras.map((skill, i) => (
                  <span key={i} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Justificativa */}
          <div className="bg-gray-50 rounded-lg p-3 mt-4">
            <p className="text-sm text-gray-600">
              <strong>Análise da IA:</strong> {justificativa}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// EXPORTS
// ============================================

export default ScoreCompatibilidadeCircle;
