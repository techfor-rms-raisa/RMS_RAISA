// ============================================================
// COMPONENTE: Badge de Adequação (Compacto)
// Caminho: src/components/raisa/AnaliseAdequacaoBadge.tsx
// ============================================================
// Versão compacta para exibir em listagens de candidatos
// Mostra score, status e permite expandir para detalhes
// ============================================================

import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ChevronRight,
  Loader2,
  RefreshCw,
  Eye
} from 'lucide-react';

import type {
  AnaliseAdequacaoPerfil,
  NivelAdequacaoGeral,
  RecomendacaoFinal
} from '@/services/analiseAdequacaoService';

import {
  calcularEstatisticas,
  getCorRecomendacao
} from '@/services/analiseAdequacaoService';

// ============================================================
// TIPOS
// ============================================================

interface AnaliseAdequacaoBadgeProps {
  analise?: AnaliseAdequacaoPerfil | null;
  loading?: boolean;
  onAnalisar?: () => void;
  onVerDetalhes?: () => void;
  tamanho?: 'sm' | 'md' | 'lg';
  mostrarDetalhes?: boolean;
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export const AnaliseAdequacaoBadge: React.FC<AnaliseAdequacaoBadgeProps> = ({
  analise,
  loading = false,
  onAnalisar,
  onVerDetalhes,
  tamanho = 'md',
  mostrarDetalhes = false
}) => {
  const [expandido, setExpandido] = useState(false);

  // Se está carregando
  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-gray-600 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Analisando...
      </div>
    );
  }

  // Se não tem análise
  if (!analise) {
    return onAnalisar ? (
      <button
        onClick={onAnalisar}
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-sm hover:bg-indigo-100 transition"
      >
        <RefreshCw className="w-4 h-4" />
        Analisar Adequação
      </button>
    ) : (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-500 rounded-full text-sm">
        <HelpCircle className="w-4 h-4" />
        Não analisado
      </span>
    );
  }

  // Com análise
  const stats = calcularEstatisticas(analise);
  const corRec = getCorRecomendacao(analise.avaliacao_final.recomendacao);

  const tamanhos = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2'
  };

  const iconeStatus = {
    'MUITO_COMPATIVEL': <CheckCircle className="w-4 h-4 text-green-500" />,
    'COMPATIVEL': <CheckCircle className="w-4 h-4 text-blue-500" />,
    'PARCIALMENTE_COMPATIVEL': <AlertTriangle className="w-4 h-4 text-yellow-500" />,
    'INCOMPATIVEL': <XCircle className="w-4 h-4 text-red-500" />
  };

  return (
    <div className="inline-block">
      {/* Badge Principal */}
      <div 
        className={`inline-flex items-center gap-2 ${tamanhos[tamanho]} ${corRec.bg} ${corRec.text} rounded-full cursor-pointer hover:opacity-90 transition`}
        onClick={() => mostrarDetalhes ? setExpandido(!expandido) : onVerDetalhes?.()}
      >
        {iconeStatus[analise.nivel_adequacao_geral]}
        <span className="font-medium">{analise.score_geral}%</span>
        <span className="opacity-75">•</span>
        <span>{analise.avaliacao_final.recomendacao}</span>
        {(mostrarDetalhes || onVerDetalhes) && (
          <ChevronRight className={`w-4 h-4 transition-transform ${expandido ? 'rotate-90' : ''}`} />
        )}
      </div>

      {/* Detalhes Expandidos */}
      {mostrarDetalhes && expandido && (
        <div className="mt-2 p-3 bg-white border rounded-lg shadow-lg text-sm max-w-xs">
          {/* Stats */}
          <div className="flex gap-4 mb-3">
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{stats.atende}</div>
              <div className="text-xs text-gray-500">Atende</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-600">{stats.atendeParcialmente}</div>
              <div className="text-xs text-gray-500">Parcial</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">{stats.gaps}</div>
              <div className="text-xs text-gray-500">Gaps</div>
            </div>
          </div>

          {/* Imprescindíveis */}
          <div className="text-xs text-gray-600 mb-2">
            <strong>Imprescindíveis:</strong> {stats.requisitosImprescindiveisAtendidos}/{stats.totalImprescindiveis}
          </div>

          {/* Gaps Críticos */}
          {analise.resumo_executivo.gaps_criticos.length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-semibold text-red-700 mb-1">Gaps Críticos:</div>
              <ul className="text-xs text-red-600 space-y-0.5">
                {analise.resumo_executivo.gaps_criticos.slice(0, 2).map((gap, i) => (
                  <li key={i}>• {gap.length > 50 ? gap.substring(0, 50) + '...' : gap}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Botão Ver Mais */}
          {onVerDetalhes && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onVerDetalhes();
              }}
              className="w-full mt-2 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition flex items-center justify-center gap-1"
            >
              <Eye className="w-3 h-3" />
              Ver Análise Completa
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// COMPONENTE: Score Circle (Gráfico Circular)
// ============================================================

interface ScoreCircleProps {
  score: number;
  tamanho?: number;
  corFundo?: string;
}

export const ScoreCircle: React.FC<ScoreCircleProps> = ({
  score,
  tamanho = 60,
  corFundo = '#f3f4f6'
}) => {
  // Determinar cor baseado no score
  const getCor = (s: number): string => {
    if (s >= 80) return '#22c55e'; // verde
    if (s >= 60) return '#3b82f6'; // azul
    if (s >= 40) return '#eab308'; // amarelo
    return '#ef4444'; // vermelho
  };

  const cor = getCor(score);
  const raio = (tamanho - 8) / 2;
  const circunferencia = 2 * Math.PI * raio;
  const offset = circunferencia - (score / 100) * circunferencia;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="transform -rotate-90">
        {/* Fundo */}
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke={corFundo}
          strokeWidth="6"
        />
        {/* Progresso */}
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke={cor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <span 
        className="absolute font-bold" 
        style={{ color: cor, fontSize: tamanho * 0.25 }}
      >
        {score}%
      </span>
    </div>
  );
};

// ============================================================
// COMPONENTE: Resumo Inline (Para tabelas)
// ============================================================

interface ResumoInlineProps {
  analise: AnaliseAdequacaoPerfil;
  onClick?: () => void;
}

export const ResumoInline: React.FC<ResumoInlineProps> = ({ analise, onClick }) => {
  const stats = calcularEstatisticas(analise);
  const corRec = getCorRecomendacao(analise.avaliacao_final.recomendacao);

  return (
    <div 
      className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition"
      onClick={onClick}
    >
      <ScoreCircle score={analise.score_geral} tamanho={40} />
      <div className="text-xs">
        <div className="flex items-center gap-1">
          <span className="text-green-600 font-medium">{stats.atende}</span>
          <span className="text-gray-400">/</span>
          <span className="text-yellow-600 font-medium">{stats.atendeParcialmente}</span>
          <span className="text-gray-400">/</span>
          <span className="text-red-600 font-medium">{stats.gaps}</span>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded ${corRec.bg} ${corRec.text}`}>
          {analise.avaliacao_final.recomendacao}
        </span>
      </div>
    </div>
  );
};

// ============================================================
// EXPORTS
// ============================================================

export default AnaliseAdequacaoBadge;
