// ============================================================
// EXEMPLO: Componente React para Exibir Análise de GAPs
// ============================================================
// Caminho sugerido: src/components/raisa/AnaliseGapsCard.tsx
// ============================================================

import React, { useState } from 'react';
import { 
  AlertTriangle, 
  XCircle, 
  CheckCircle, 
  HelpCircle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Lightbulb
} from 'lucide-react';
import type { AnaliseGapsCompleta, GapAnalise } from '@/services/claudeService';

// ============================================================
// TIPOS
// ============================================================

interface AnaliseGapsCardProps {
  analiseGaps: AnaliseGapsCompleta;
  onInvestigarGap?: (gap: GapAnalise) => void;
  candidatoNome?: string;
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export const AnaliseGapsCard: React.FC<AnaliseGapsCardProps> = ({
  analiseGaps,
  onInvestigarGap,
  candidatoNome = 'Candidato'
}) => {
  const [expandido, setExpandido] = useState(true);
  const [secaoExpandida, setSecaoExpandida] = useState<string | null>('eliminatorios');

  const toggleSecao = (secao: string) => {
    setSecaoExpandida(secaoExpandida === secao ? null : secao);
  };

  // Determinar status geral
  const temEliminatorios = analiseGaps.gaps_eliminatorios.length > 0;
  const temParaAvaliar = analiseGaps.gaps_para_avaliar.length > 0;

  const getStatusGeral = () => {
    if (temEliminatorios) {
      return {
        cor: 'bg-red-50 border-red-200',
        icone: <XCircle className="w-6 h-6 text-red-500" />,
        texto: 'GAPs Eliminatórios Encontrados',
        textoCor: 'text-red-700'
      };
    }
    if (temParaAvaliar) {
      return {
        cor: 'bg-yellow-50 border-yellow-200',
        icone: <AlertTriangle className="w-6 h-6 text-yellow-500" />,
        texto: 'GAPs Requerem Avaliação',
        textoCor: 'text-yellow-700'
      };
    }
    return {
      cor: 'bg-green-50 border-green-200',
      icone: <CheckCircle className="w-6 h-6 text-green-500" />,
      texto: 'Sem GAPs Críticos',
      textoCor: 'text-green-700'
    };
  };

  const status = getStatusGeral();

  return (
    <div className={`rounded-xl border-2 ${status.cor} overflow-hidden`}>
      {/* Header */}
      <div 
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setExpandido(!expandido)}
      >
        <div className="flex items-center gap-3">
          {status.icone}
          <div>
            <h3 className={`font-semibold ${status.textoCor}`}>
              {status.texto}
            </h3>
            <p className="text-sm text-gray-600">
              {analiseGaps.total_gaps} GAP(s) identificado(s) para {candidatoNome}
            </p>
          </div>
        </div>
        <button className="p-2 hover:bg-white/50 rounded-lg transition">
          {expandido ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>
      </div>

      {/* Conteúdo Expandido */}
      {expandido && (
        <div className="border-t border-gray-200 bg-white">
          {/* Resumo */}
          <div className="p-4 bg-gray-50 border-b">
            <p className="text-sm text-gray-700">
              <strong>Resumo:</strong> {analiseGaps.resumo_gaps}
            </p>
            {analiseGaps.recomendacao_analista && (
              <div className="mt-2 flex items-start gap-2 text-sm text-indigo-700 bg-indigo-50 p-3 rounded-lg">
                <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p><strong>Recomendação:</strong> {analiseGaps.recomendacao_analista}</p>
              </div>
            )}
          </div>

          {/* GAPs Eliminatórios */}
          {analiseGaps.gaps_eliminatorios.length > 0 && (
            <SecaoGaps
              titulo="GAPs Eliminatórios"
              descricao="Requisitos obrigatórios não atendidos - desqualificam o candidato"
              gaps={analiseGaps.gaps_eliminatorios}
              corIcone="text-red-500"
              corFundo="bg-red-50"
              icone={<XCircle className="w-5 h-5" />}
              expandida={secaoExpandida === 'eliminatorios'}
              onToggle={() => toggleSecao('eliminatorios')}
              onInvestigar={onInvestigarGap}
            />
          )}

          {/* GAPs para Avaliar */}
          {analiseGaps.gaps_para_avaliar.length > 0 && (
            <SecaoGaps
              titulo="GAPs para Avaliação"
              descricao="Requerem investigação pelo analista antes de decidir"
              gaps={analiseGaps.gaps_para_avaliar}
              corIcone="text-yellow-500"
              corFundo="bg-yellow-50"
              icone={<AlertTriangle className="w-5 h-5" />}
              expandida={secaoExpandida === 'avaliar'}
              onToggle={() => toggleSecao('avaliar')}
              onInvestigar={onInvestigarGap}
              mostrarPerguntas
            />
          )}

          {/* GAPs Aceitáveis */}
          {analiseGaps.gaps_aceitaveis.length > 0 && (
            <SecaoGaps
              titulo="GAPs Aceitáveis"
              descricao="Lacunas menores que não impedem a continuidade"
              gaps={analiseGaps.gaps_aceitaveis}
              corIcone="text-gray-400"
              corFundo="bg-gray-50"
              icone={<HelpCircle className="w-5 h-5" />}
              expandida={secaoExpandida === 'aceitaveis'}
              onToggle={() => toggleSecao('aceitaveis')}
              onInvestigar={onInvestigarGap}
            />
          )}

          {/* Nenhum GAP */}
          {analiseGaps.total_gaps === 0 && (
            <div className="p-6 text-center text-green-600">
              <CheckCircle className="w-12 h-12 mx-auto mb-2" />
              <p className="font-medium">Nenhum GAP significativo identificado!</p>
              <p className="text-sm text-gray-500 mt-1">
                O candidato atende todos os requisitos da vaga.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// COMPONENTE: Seção de GAPs
// ============================================================

interface SecaoGapsProps {
  titulo: string;
  descricao: string;
  gaps: GapAnalise[];
  corIcone: string;
  corFundo: string;
  icone: React.ReactNode;
  expandida: boolean;
  onToggle: () => void;
  onInvestigar?: (gap: GapAnalise) => void;
  mostrarPerguntas?: boolean;
}

const SecaoGaps: React.FC<SecaoGapsProps> = ({
  titulo,
  descricao,
  gaps,
  corIcone,
  corFundo,
  icone,
  expandida,
  onToggle,
  onInvestigar,
  mostrarPerguntas = false
}) => {
  return (
    <div className="border-b last:border-b-0">
      {/* Header da Seção */}
      <button
        className={`w-full p-4 flex items-center justify-between hover:bg-gray-50 transition ${corFundo}`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className={corIcone}>{icone}</span>
          <div className="text-left">
            <h4 className="font-medium text-gray-900">
              {titulo} ({gaps.length})
            </h4>
            <p className="text-xs text-gray-500">{descricao}</p>
          </div>
        </div>
        {expandida ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Lista de GAPs */}
      {expandida && (
        <div className="divide-y divide-gray-100">
          {gaps.map((gap, index) => (
            <GapItem 
              key={index} 
              gap={gap} 
              onInvestigar={onInvestigar}
              mostrarPergunta={mostrarPerguntas}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// COMPONENTE: Item de GAP Individual
// ============================================================

interface GapItemProps {
  gap: GapAnalise;
  onInvestigar?: (gap: GapAnalise) => void;
  mostrarPergunta?: boolean;
}

const GapItem: React.FC<GapItemProps> = ({ 
  gap, 
  onInvestigar,
  mostrarPergunta = false 
}) => {
  const getCategoriaLabel = (categoria: string) => {
    const labels: Record<string, string> = {
      'TECNICO': '💻 Técnico',
      'EXPERIENCIA': '📊 Experiência',
      'FORMACAO': '🎓 Formação',
      'IDIOMA': '🌍 Idioma',
      'SOFT_SKILL': '🤝 Soft Skill',
      'CULTURAL': '🏢 Cultural',
      'LOGISTICO': '📍 Logístico'
    };
    return labels[categoria] || categoria;
  };

  const getSeveridadeBadge = (severidade: string) => {
    const badges: Record<string, string> = {
      'ELIMINATORIO': 'bg-red-100 text-red-700',
      'IMPORTANTE': 'bg-yellow-100 text-yellow-700',
      'DESEJAVEL': 'bg-blue-100 text-blue-700',
      'MENOR': 'bg-gray-100 text-gray-700'
    };
    return badges[severidade] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="p-4 hover:bg-gray-50">
      {/* Header do GAP */}
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          {getCategoriaLabel(gap.categoria)}
        </span>
        <span className={`text-xs px-2 py-1 rounded-full ${getSeveridadeBadge(gap.severidade)}`}>
          {gap.severidade}
        </span>
      </div>

      {/* Comparação */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Vaga exige:</p>
          <p className="text-sm text-gray-900">{gap.requisito_vaga}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Candidato tem:</p>
          <p className="text-sm text-gray-900">{gap.situacao_candidato}</p>
        </div>
      </div>

      {/* Justificativa */}
      <p className="text-sm text-gray-600 mb-3">
        <strong>Análise:</strong> {gap.justificativa}
      </p>

      {/* Pergunta Sugerida (para GAPs que requerem avaliação) */}
      {mostrarPergunta && gap.pergunta_sugerida && (
        <div className="bg-indigo-50 p-3 rounded-lg mb-3">
          <div className="flex items-start gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-indigo-600 font-medium mb-1">
                Pergunta sugerida para investigar:
              </p>
              <p className="text-sm text-indigo-800 italic">
                "{gap.pergunta_sugerida}"
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Possível Mitigação */}
      {gap.possivel_mitigacao && (
        <div className="bg-green-50 p-3 rounded-lg mb-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-green-600 font-medium mb-1">
                Possível mitigação:
              </p>
              <p className="text-sm text-green-800">
                {gap.possivel_mitigacao}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Botão de Ação */}
      {onInvestigar && gap.impacto === 'REQUER_AVALIACAO' && (
        <button
          onClick={() => onInvestigar(gap)}
          className="w-full mt-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2"
        >
          <MessageSquare className="w-4 h-4" />
          Adicionar pergunta à entrevista
        </button>
      )}
    </div>
  );
};

// ============================================================
// COMPONENTE: Badge de Status de GAPs (Resumido)
// ============================================================

interface GapStatusBadgeProps {
  analiseGaps: AnaliseGapsCompleta;
  size?: 'sm' | 'md' | 'lg';
}

export const GapStatusBadge: React.FC<GapStatusBadgeProps> = ({ 
  analiseGaps,
  size = 'md'
}) => {
  const temEliminatorios = analiseGaps.gaps_eliminatorios.length > 0;
  const temParaAvaliar = analiseGaps.gaps_para_avaliar.length > 0;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2'
  };

  if (temEliminatorios) {
    return (
      <span className={`inline-flex items-center gap-1 bg-red-100 text-red-700 rounded-full ${sizeClasses[size]}`}>
        <XCircle className="w-3 h-3" />
        {analiseGaps.gaps_eliminatorios.length} GAP(s) eliminatório(s)
      </span>
    );
  }

  if (temParaAvaliar) {
    return (
      <span className={`inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 rounded-full ${sizeClasses[size]}`}>
        <AlertTriangle className="w-3 h-3" />
        {analiseGaps.gaps_para_avaliar.length} GAP(s) para avaliar
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 bg-green-100 text-green-700 rounded-full ${sizeClasses[size]}`}>
      <CheckCircle className="w-3 h-3" />
      Sem GAPs críticos
    </span>
  );
};

// ============================================================
// EXPORTS
// ============================================================

export default AnaliseGapsCard;
