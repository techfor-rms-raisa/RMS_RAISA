// ============================================================
// COMPONENTE: Painel de Análise de Adequação de Perfil
// Caminho: src/components/raisa/AnaliseAdequacaoPanel.tsx
// ============================================================
// Exibe análise profunda requisito a requisito entre Candidato × Vaga
// Visualização completa com estatísticas, gaps e perguntas
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Lightbulb,
  Target,
  Award,
  FileText,
  Users,
  TrendingUp,
  AlertCircle,
  BookOpen,
  Briefcase,
  Download,
  Copy,
  Check,
  Info
} from 'lucide-react';

import type {
  AnaliseAdequacaoPerfil,
  RequisitoAnalisado,
  CategoriaPerguntas,
  NivelAdequacao,
  RecomendacaoFinal,
  TipoRequisito
} from '@/services/analiseAdequacaoService';

import {
  calcularEstatisticas,
  getCorAdequacao,
  getCorRecomendacao,
  getIconeTipoRequisito,
  getLabelAdequacao
} from '@/services/analiseAdequacaoService';

// ============================================================
// TIPOS
// ============================================================

interface AnaliseAdequacaoPanelProps {
  analise: AnaliseAdequacaoPerfil;
  onAddPergunta?: (pergunta: string) => void;
  onExportar?: () => void;
  compacto?: boolean;
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export const AnaliseAdequacaoPanel: React.FC<AnaliseAdequacaoPanelProps> = ({
  analise,
  onAddPergunta,
  onExportar,
  compacto = false
}) => {
  const [secaoExpandida, setSecaoExpandida] = useState<string>('resumo');
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const stats = useMemo(() => calcularEstatisticas(analise), [analise]);
  const corRecomendacao = getCorRecomendacao(analise.avaliacao_final.recomendacao);

  const copiarTexto = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto);
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 2000);
  };

  const toggleSecao = (secao: string) => {
    setSecaoExpandida(secaoExpandida === secao ? '' : secao);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* ========== HEADER ========== */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold mb-1">
              Análise de Adequação de Perfil
            </h2>
            <p className="text-indigo-100 text-sm">
              {analise.candidato_nome} × {analise.vaga_titulo}
            </p>
          </div>
          {onExportar && (
            <button
              onClick={onExportar}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 transition"
            >
              <Download className="w-4 h-4" />
              Exportar PDF
            </button>
          )}
        </div>

        {/* Score Principal */}
        <div className="mt-6 flex items-center gap-8">
          <div className="text-center">
            <div className="text-5xl font-bold">{analise.score_geral}%</div>
            <div className="text-indigo-200 text-sm mt-1">Score Geral</div>
          </div>
          
          <div className="flex-1 grid grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-semibold text-green-300">{stats.atende}</div>
              <div className="text-xs text-indigo-200">Atende</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-semibold text-yellow-300">{stats.atendeParcialmente}</div>
              <div className="text-xs text-indigo-200">Parcial</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-semibold text-red-300">{stats.gaps}</div>
              <div className="text-xs text-indigo-200">Gaps</div>
            </div>
          </div>

          <div className={`px-4 py-2 rounded-full ${corRecomendacao.bg} ${corRecomendacao.text} font-semibold`}>
            {corRecomendacao.icon} {analise.avaliacao_final.recomendacao}
          </div>
        </div>
      </div>

      {/* ========== CONTEÚDO ========== */}
      <div className="divide-y divide-gray-100">
        
        {/* ----- RESUMO EXECUTIVO ----- */}
        <SecaoColapsavel
          titulo="Resumo Executivo"
          icone={<FileText className="w-5 h-5" />}
          expandida={secaoExpandida === 'resumo'}
          onToggle={() => toggleSecao('resumo')}
          badge={`${analise.nivel_adequacao_geral.replace(/_/g, ' ')}`}
          badgeCor="bg-indigo-100 text-indigo-700"
        >
          <div className="grid md:grid-cols-2 gap-6">
            {/* Pontos Fortes */}
            <div className="bg-green-50 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5" />
                Principais Pontos Fortes
              </h4>
              <ul className="space-y-2">
                {analise.resumo_executivo.principais_pontos_fortes.map((ponto, i) => (
                  <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                    <span className="text-green-500 mt-1">•</span>
                    {ponto}
                  </li>
                ))}
              </ul>
            </div>

            {/* Gaps Críticos */}
            {analise.resumo_executivo.gaps_criticos.length > 0 && (
              <div className="bg-red-50 rounded-lg p-4">
                <h4 className="font-semibold text-red-800 flex items-center gap-2 mb-3">
                  <XCircle className="w-5 h-5" />
                  Gaps Críticos
                </h4>
                <ul className="space-y-2">
                  {analise.resumo_executivo.gaps_criticos.map((gap, i) => (
                    <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                      <span className="text-red-500 mt-1">•</span>
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Gaps para Investigar */}
            {analise.resumo_executivo.gaps_investigar.length > 0 && (
              <div className="bg-yellow-50 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-800 flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5" />
                  Gaps para Investigar
                </h4>
                <ul className="space-y-2">
                  {analise.resumo_executivo.gaps_investigar.map((gap, i) => (
                    <li key={i} className="text-sm text-yellow-700 flex items-start gap-2">
                      <span className="text-yellow-500 mt-1">•</span>
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Diferenciais */}
            {analise.resumo_executivo.diferenciais_candidato.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 flex items-center gap-2 mb-3">
                  <Award className="w-5 h-5" />
                  Diferenciais do Candidato
                </h4>
                <ul className="space-y-2">
                  {analise.resumo_executivo.diferenciais_candidato.map((dif, i) => (
                    <li key={i} className="text-sm text-blue-700 flex items-start gap-2">
                      <span className="text-blue-500 mt-1">★</span>
                      {dif}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SecaoColapsavel>

        {/* ----- REQUISITOS IMPRESCINDÍVEIS ----- */}
        <SecaoColapsavel
          titulo="Requisitos Imprescindíveis"
          icone={<Target className="w-5 h-5" />}
          expandida={secaoExpandida === 'imprescindiveis'}
          onToggle={() => toggleSecao('imprescindiveis')}
          badge={`${stats.requisitosImprescindiveisAtendidos}/${stats.totalImprescindiveis}`}
          badgeCor={stats.requisitosImprescindiveisAtendidos === stats.totalImprescindiveis 
            ? "bg-green-100 text-green-700" 
            : "bg-yellow-100 text-yellow-700"}
        >
          <div className="space-y-4">
            {analise.requisitos_imprescindiveis.map((req, i) => (
              <RequisitoCard 
                key={i} 
                requisito={req} 
                onCopiar={(texto) => copiarTexto(texto, `req-${i}`)}
                copiado={copiadoId === `req-${i}`}
                onAddPergunta={onAddPergunta}
              />
            ))}
          </div>
        </SecaoColapsavel>

        {/* ----- REQUISITOS MUITO DESEJÁVEIS ----- */}
        {analise.requisitos_muito_desejaveis.length > 0 && (
          <SecaoColapsavel
            titulo="Requisitos Muito Desejáveis"
            icone={<TrendingUp className="w-5 h-5" />}
            expandida={secaoExpandida === 'muito_desejaveis'}
            onToggle={() => toggleSecao('muito_desejaveis')}
            badge={`${analise.requisitos_muito_desejaveis.filter(r => r.nivel_adequacao === 'ATENDE').length}/${analise.requisitos_muito_desejaveis.length}`}
            badgeCor="bg-blue-100 text-blue-700"
          >
            <div className="space-y-4">
              {analise.requisitos_muito_desejaveis.map((req, i) => (
                <RequisitoCard 
                  key={i} 
                  requisito={req}
                  onCopiar={(texto) => copiarTexto(texto, `muito-${i}`)}
                  copiado={copiadoId === `muito-${i}`}
                  onAddPergunta={onAddPergunta}
                />
              ))}
            </div>
          </SecaoColapsavel>
        )}

        {/* ----- REQUISITOS DESEJÁVEIS ----- */}
        {analise.requisitos_desejaveis.length > 0 && (
          <SecaoColapsavel
            titulo="Requisitos Desejáveis"
            icone={<Briefcase className="w-5 h-5" />}
            expandida={secaoExpandida === 'desejaveis'}
            onToggle={() => toggleSecao('desejaveis')}
            badge={`${analise.requisitos_desejaveis.filter(r => r.nivel_adequacao === 'ATENDE').length}/${analise.requisitos_desejaveis.length}`}
            badgeCor="bg-gray-100 text-gray-700"
          >
            <div className="space-y-4">
              {analise.requisitos_desejaveis.map((req, i) => (
                <RequisitoCard 
                  key={i} 
                  requisito={req}
                  compacto
                  onCopiar={(texto) => copiarTexto(texto, `desej-${i}`)}
                  copiado={copiadoId === `desej-${i}`}
                  onAddPergunta={onAddPergunta}
                />
              ))}
            </div>
          </SecaoColapsavel>
        )}

        {/* ----- PERGUNTAS DE ENTREVISTA ----- */}
        <SecaoColapsavel
          titulo="Perguntas de Entrevista"
          icone={<MessageSquare className="w-5 h-5" />}
          expandida={secaoExpandida === 'perguntas'}
          onToggle={() => toggleSecao('perguntas')}
          badge={`${analise.perguntas_entrevista.reduce((acc, cat) => acc + cat.perguntas.length, 0)} perguntas`}
          badgeCor="bg-purple-100 text-purple-700"
        >
          <div className="space-y-6">
            {analise.perguntas_entrevista.map((categoria, i) => (
              <CategoriaPerguntas 
                key={i} 
                categoria={categoria}
                onCopiar={(texto) => copiarTexto(texto, `perg-${i}`)}
                copiado={copiadoId?.startsWith(`perg-${i}`)}
                onAddPergunta={onAddPergunta}
              />
            ))}
          </div>
        </SecaoColapsavel>

        {/* ----- AVALIAÇÃO FINAL ----- */}
        <SecaoColapsavel
          titulo="Avaliação Final"
          icone={<BookOpen className="w-5 h-5" />}
          expandida={secaoExpandida === 'avaliacao'}
          onToggle={() => toggleSecao('avaliacao')}
          badge={analise.avaliacao_final.recomendacao}
          badgeCor={`${corRecomendacao.bg} ${corRecomendacao.text}`}
        >
          <div className="space-y-6">
            {/* Recomendação */}
            <div className={`p-4 rounded-lg ${corRecomendacao.bg}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{corRecomendacao.icon}</span>
                <h4 className={`text-lg font-bold ${corRecomendacao.text}`}>
                  {analise.avaliacao_final.recomendacao}
                </h4>
              </div>
              <p className={`${corRecomendacao.text}`}>
                {analise.avaliacao_final.justificativa}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Próximos Passos */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-500" />
                  Próximos Passos
                </h4>
                <ol className="space-y-2 list-decimal list-inside">
                  {analise.avaliacao_final.proximos_passos.map((passo, i) => (
                    <li key={i} className="text-sm text-gray-700">{passo}</li>
                  ))}
                </ol>
              </div>

              {/* Riscos */}
              {analise.avaliacao_final.riscos_identificados.length > 0 && (
                <div className="bg-orange-50 rounded-lg p-4">
                  <h4 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Riscos Identificados
                  </h4>
                  <ul className="space-y-2">
                    {analise.avaliacao_final.riscos_identificados.map((risco, i) => (
                      <li key={i} className="text-sm text-orange-700 flex items-start gap-2">
                        <span className="text-orange-500 mt-1">⚠️</span>
                        {risco}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Pontos de Atenção na Entrevista */}
            {analise.avaliacao_final.pontos_atencao_entrevista.length > 0 && (
              <div className="bg-indigo-50 rounded-lg p-4">
                <h4 className="font-semibold text-indigo-800 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Pontos de Atenção na Entrevista
                </h4>
                <ul className="space-y-2">
                  {analise.avaliacao_final.pontos_atencao_entrevista.map((ponto, i) => (
                    <li key={i} className="text-sm text-indigo-700 flex items-start gap-2">
                      <Info className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                      {ponto}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SecaoColapsavel>
      </div>

      {/* ========== FOOTER ========== */}
      <div className="bg-gray-50 px-6 py-3 text-xs text-gray-500 flex justify-between items-center">
        <span>
          Análise gerada em {new Date(analise.data_analise).toLocaleString('pt-BR')}
        </span>
        <span>
          Confiança: {analise.confianca_analise}%
        </span>
      </div>
    </div>
  );
};

// ============================================================
// COMPONENTES AUXILIARES
// ============================================================

// Seção Colapsável
interface SecaoColapsavelProps {
  titulo: string;
  icone: React.ReactNode;
  expandida: boolean;
  onToggle: () => void;
  badge?: string;
  badgeCor?: string;
  children: React.ReactNode;
}

const SecaoColapsavel: React.FC<SecaoColapsavelProps> = ({
  titulo,
  icone,
  expandida,
  onToggle,
  badge,
  badgeCor = 'bg-gray-100 text-gray-700',
  children
}) => (
  <div>
    <button
      onClick={onToggle}
      className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition"
    >
      <div className="flex items-center gap-3">
        <span className="text-gray-500">{icone}</span>
        <h3 className="font-semibold text-gray-900">{titulo}</h3>
        {badge && (
          <span className={`text-xs px-2 py-1 rounded-full ${badgeCor}`}>
            {badge}
          </span>
        )}
      </div>
      {expandida ? (
        <ChevronUp className="w-5 h-5 text-gray-400" />
      ) : (
        <ChevronDown className="w-5 h-5 text-gray-400" />
      )}
    </button>
    {expandida && (
      <div className="px-6 pb-6">
        {children}
      </div>
    )}
  </div>
);

// Card de Requisito
interface RequisitoCardProps {
  requisito: RequisitoAnalisado;
  compacto?: boolean;
  onCopiar?: (texto: string) => void;
  copiado?: boolean;
  onAddPergunta?: (pergunta: string) => void;
}

const RequisitoCard: React.FC<RequisitoCardProps> = ({
  requisito,
  compacto = false,
  onCopiar,
  copiado,
  onAddPergunta
}) => {
  const cores = getCorAdequacao(requisito.nivel_adequacao);
  const icone = getIconeTipoRequisito(requisito.tipo);

  return (
    <div className={`border rounded-lg overflow-hidden ${cores.border}`}>
      {/* Header */}
      <div className={`px-4 py-3 ${cores.bg} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className="text-lg">{icone}</span>
          <div>
            <h4 className="font-medium text-gray-900">{requisito.requisito}</h4>
            <span className="text-xs text-gray-500">{requisito.tipo.replace(/_/g, ' ')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${cores.bg} ${cores.text} border ${cores.border}`}>
            {getLabelAdequacao(requisito.nivel_adequacao)}
          </span>
          <span className="text-sm text-gray-500">{requisito.score_adequacao}%</span>
        </div>
      </div>

      {/* Corpo */}
      <div className="p-4 space-y-4">
        {/* Justificativa */}
        <p className="text-sm text-gray-700">{requisito.justificativa}</p>

        {!compacto && (
          <>
            {/* Evidências */}
            <div className="grid md:grid-cols-2 gap-4">
              {requisito.analise_candidato.evidencias_encontradas.length > 0 && (
                <div className="bg-green-50 rounded-lg p-3">
                  <h5 className="text-xs font-semibold text-green-800 mb-2 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Evidências Encontradas
                  </h5>
                  <ul className="space-y-1">
                    {requisito.analise_candidato.evidencias_encontradas.map((ev, i) => (
                      <li key={i} className="text-xs text-green-700">• {ev}</li>
                    ))}
                  </ul>
                </div>
              )}

              {requisito.analise_candidato.evidencias_ausentes.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3">
                  <h5 className="text-xs font-semibold text-red-800 mb-2 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    Não Encontrado
                  </h5>
                  <ul className="space-y-1">
                    {requisito.analise_candidato.evidencias_ausentes.map((ev, i) => (
                      <li key={i} className="text-xs text-red-700">• {ev}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Experiências Relacionadas */}
            {requisito.analise_candidato.experiencias_relacionadas.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-3">
                <h5 className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />
                  Experiências Relacionadas
                </h5>
                <ul className="space-y-1">
                  {requisito.analise_candidato.experiencias_relacionadas.map((exp, i) => (
                    <li key={i} className="text-xs text-blue-700">• {exp}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* Pergunta de Investigação */}
        {requisito.pergunta_investigacao && (
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h5 className="text-xs font-semibold text-purple-800 mb-1">
                    Pergunta para Investigar
                  </h5>
                  <p className="text-sm text-purple-700 italic">
                    "{requisito.pergunta_investigacao}"
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                {onCopiar && (
                  <button
                    onClick={() => onCopiar(requisito.pergunta_investigacao!)}
                    className="p-1.5 hover:bg-purple-100 rounded transition"
                    title="Copiar pergunta"
                  >
                    {copiado ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-purple-500" />
                    )}
                  </button>
                )}
                {onAddPergunta && (
                  <button
                    onClick={() => onAddPergunta(requisito.pergunta_investigacao!)}
                    className="p-1.5 hover:bg-purple-100 rounded transition"
                    title="Adicionar à entrevista"
                  >
                    <MessageSquare className="w-4 h-4 text-purple-500" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Como Mitigar */}
        {requisito.como_mitigar && (
          <div className="bg-amber-50 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <h5 className="text-xs font-semibold text-amber-800 mb-1">
                  Possível Mitigação
                </h5>
                <p className="text-sm text-amber-700">
                  {requisito.como_mitigar}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Categoria de Perguntas
interface CategoriaPerguntas {
  categoria: CategoriaPerguntas;
  onCopiar?: (texto: string) => void;
  copiado?: boolean;
  onAddPergunta?: (pergunta: string) => void;
}

const CategoriaPerguntas: React.FC<{
  categoria: CategoriaPerguntas;
  onCopiar?: (texto: string) => void;
  copiado?: boolean;
  onAddPergunta?: (pergunta: string) => void;
}> = ({ categoria, onCopiar, copiado, onAddPergunta }) => (
  <div className="border rounded-lg overflow-hidden">
    <div className="bg-gray-50 px-4 py-3 flex items-center gap-2">
      <span className="text-lg">{categoria.icone}</span>
      <h4 className="font-semibold text-gray-900">{categoria.categoria}</h4>
      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
        {categoria.perguntas.length} pergunta{categoria.perguntas.length > 1 ? 's' : ''}
      </span>
    </div>
    <div className="divide-y divide-gray-100">
      {categoria.perguntas.map((pergunta, i) => (
        <div key={i} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 mb-2">
                {i + 1}. {pergunta.pergunta}
              </p>
              <p className="text-xs text-gray-500 mb-2">
                <strong>Objetivo:</strong> {pergunta.objetivo}
              </p>
              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <span className="text-gray-500">Avaliar: </span>
                  {pergunta.o_que_avaliar.map((item, j) => (
                    <span key={j} className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded mr-1">
                      {item}
                    </span>
                  ))}
                </div>
                {pergunta.red_flags.length > 0 && (
                  <div>
                    <span className="text-gray-500">Red flags: </span>
                    {pergunta.red_flags.map((flag, j) => (
                      <span key={j} className="inline-block bg-red-50 text-red-700 px-2 py-0.5 rounded mr-1">
                        {flag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              {onCopiar && (
                <button
                  onClick={() => onCopiar(pergunta.pergunta)}
                  className="p-1.5 hover:bg-gray-100 rounded transition"
                  title="Copiar"
                >
                  <Copy className="w-4 h-4 text-gray-500" />
                </button>
              )}
              {onAddPergunta && (
                <button
                  onClick={() => onAddPergunta(pergunta.pergunta)}
                  className="p-1.5 hover:bg-indigo-100 rounded transition"
                  title="Adicionar à entrevista"
                >
                  <MessageSquare className="w-4 h-4 text-indigo-500" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ============================================================
// EXPORTS
// ============================================================

export default AnaliseAdequacaoPanel;
