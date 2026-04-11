// src/components/HistoricoAtividadesModal.tsx
// v2.1 — 11/04/2026
//   - tipoUsuario: mascara relatórios confidenciais para Consulta e Cliente
//   - Badge "🔒 Confidencial" exibido para perfis autorizados
//   - Sem alteração de layout/design existente

import React, { useMemo } from 'react';
import { X, Calendar, FileText, AlertCircle, TrendingUp, Bot, Bell, Lock } from 'lucide-react';
import { Consultant, ConsultantReport } from '@/types';

interface HistoricoAtividadesModalProps {
  consultant: Consultant;
  reports?: ConsultantReport[];
  allReports?: ConsultantReport[];
  onClose: () => void;
  /** Tipo do usuário logado — usado para controle de acesso ao conteúdo confidencial */
  tipoUsuario?: string;
}

/** Perfis que NÃO podem ver conteúdo marcado como confidencial */
const PERFIS_SEM_ACESSO_CONFIDENCIAL = ['Consulta', 'Cliente'];

const HistoricoAtividadesModal: React.FC<HistoricoAtividadesModalProps> = ({
  consultant,
  reports,
  allReports,
  onClose,
  tipoUsuario,
}) => {
  const reportsData = reports || allReports || [];

  const podeVerConfidencial = !PERFIS_SEM_ACESSO_CONFIDENCIAL.includes(tipoUsuario ?? '');

  const reportsLast90Days = useMemo(() => {
    if (!Array.isArray(reportsData)) {
      console.warn('⚠️ HistoricoAtividadesModal: reports não é um array válido', reportsData);
      return [];
    }

    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

    return reportsData
      .filter(report => {
        try {
          const dateStr = (report as any).created_at || report.createdAt;
          if (!dateStr) return true;
          const reportDate = new Date(dateStr);
          return reportDate >= ninetyDaysAgo && reportDate <= today;
        } catch {
          return true;
        }
      })
      .sort((a, b) => {
        try {
          const dateStrA = (a as any).created_at || a.createdAt || '';
          const dateStrB = (b as any).created_at || b.createdAt || '';
          return new Date(dateStrB).getTime() - new Date(dateStrA).getTime();
        } catch {
          return 0;
        }
      });
  }, [reportsData]);

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'Data inválida';
    }
  };

  const getScoreColor = (score: number): string => {
    const colors: { [key: number]: string } = {
      5: '#d32f2f',
      4: '#f57c00',
      3: '#fbc02d',
      2: '#388e3c',
      1: '#1976d2',
    };
    return colors[score] || '#757575';
  };

  const getScoreLabel = (score: number): string => {
    const labels: { [key: number]: string } = {
      5: 'CRÍTICO',
      4: 'ALTO',
      3: 'MODERADO',
      2: 'BAIXO',
      1: 'MÍNIMO',
    };
    return labels[score] || 'N/A';
  };

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Histórico de Atividades</h2>
                <p className="text-white/90 text-sm">
                  {consultant.nome_consultores} • {consultant.cargo_consultores}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition"
              aria-label="Fechar"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Summary Card */}
        <div className="px-6 pt-4 pb-2">
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <FileText className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-purple-900">{reportsLast90Days.length}</p>
                  <p className="text-sm text-purple-700">
                    {reportsLast90Days.length === 1 ? 'relatório encontrado' : 'relatórios encontrados'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-purple-600">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm font-semibold">Últimos 90 dias</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {reportsLast90Days.length === 0 ? (
            <div className="text-center py-16">
              <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-gray-700 text-lg font-semibold mb-2">Nenhum relatório encontrado</p>
              <p className="text-gray-500 text-sm">
                Não há relatórios de atividades nos últimos 90 dias para este consultor.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reportsLast90Days.map((report, index) => {
                const isConfidencial = !!(report as any).confidencial;

                // Perfis sem acesso veem bloco mascarado
                if (isConfidencial && !podeVerConfidencial) {
                  return (
                    <div
                      key={(report as any).id || index}
                      className="bg-gray-50 border-2 border-dashed border-red-200 rounded-xl p-5 flex items-center gap-4"
                    >
                      <div className="bg-red-100 p-3 rounded-lg flex-shrink-0">
                        <Lock className="w-6 h-6 text-red-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-red-700">
                          🔒 Relatório Confidencial
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {monthNames[report.month - 1]} {report.year} —{' '}
                          {formatDate((report as any).created_at || report.createdAt || '')}
                        </p>
                        <p className="text-xs text-red-400 mt-1">
                          O conteúdo deste relatório é restrito e não está disponível para o seu perfil.
                        </p>
                      </div>
                    </div>
                  );
                }

                // Exibição normal (autorizado ou não confidencial)
                const conteudoExibir =
                  (report as any).relatorio ||
                  report.content ||
                  report.summary ||
                  'Conteúdo não disponível';
                const temResumoSeparado =
                  report.summary &&
                  ((report as any).relatorio || report.content) &&
                  report.summary !== ((report as any).relatorio || report.content);

                return (
                  <div
                    key={(report as any).id || index}
                    className="bg-white border-2 border-gray-100 rounded-xl p-5 hover:border-purple-200 hover:shadow-lg transition-all duration-200"
                  >
                    {/* Report Header */}
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="bg-gray-100 p-2 rounded-lg">
                          <Calendar className="w-4 h-4 text-gray-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-800">
                              {monthNames[report.month - 1]} {report.year}
                            </span>
                            {/* Badge Confidencial — visível para perfis autorizados */}
                            {isConfidencial && podeVerConfidencial && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full border border-red-200">
                                <Lock className="w-3 h-3" />
                                Confidencial
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatDate((report as any).created_at || report.createdAt || '')}
                          </p>
                        </div>
                      </div>
                      <div
                        className="px-4 py-1.5 rounded-full text-white text-xs font-bold shadow-md"
                        style={{
                          backgroundColor: getScoreColor(
                            (report as any).risco_analista ??
                              (report as any).risk_score ??
                              report.riskScore
                          ),
                        }}
                      >
                        {getScoreLabel(
                          (report as any).risco_analista ??
                            (report as any).risk_score ??
                            report.riskScore
                        )}{' '}
                        •{' '}
                        {(report as any).risco_analista ??
                          (report as any).risk_score ??
                          report.riskScore}
                      </div>
                    </div>

                    {/* Conteúdo */}
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5" />
                          Relatório de Atividade
                        </h4>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {conteudoExibir}
                        </div>
                      </div>

                      {temResumoSeparado && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                            <Bot className="w-3.5 h-3.5" />
                            Resumo da IA
                          </h4>
                          <p className="text-sm text-blue-800">{report.summary}</p>
                        </div>
                      )}

                      {/* Notificados */}
                      {(() => {
                        const notificados: string[] = [];
                        const n = (report as any).notificados;
                        if (n?.gestao_comercial) notificados.push('Gestão Comercial');
                        if (n?.gestao_rs) notificados.push('Gestão R&S');
                        if (n?.gestao_pessoas) notificados.push('Gestão Pessoas');
                        if (notificados.length === 0) return null;
                        return (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                              <Bell className="w-3.5 h-3.5" />
                              Notificados
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {notificados.map(n => (
                                <span
                                  key={n}
                                  className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium border border-amber-300"
                                >
                                  ✉ {n}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Recomendações */}
                      {report.recommendations &&
                        Array.isArray(report.recommendations) &&
                        report.recommendations.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                              Recomendações
                            </h4>
                            <div className="space-y-2">
                              {report.recommendations.map((rec, idx) => (
                                <div
                                  key={idx}
                                  className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r-lg"
                                >
                                  <span className="font-bold text-blue-900 text-xs uppercase">
                                    {rec.tipo}
                                  </span>
                                  <p className="text-gray-700 text-sm mt-1">{rec.descricao}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition font-semibold shadow-md"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoricoAtividadesModal;
