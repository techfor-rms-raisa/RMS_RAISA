// src/components/MonthlyReportsModal.tsx
// v2.1 — 11/04/2026
//   - tipoUsuario: mascara relatórios confidenciais para Consulta e Cliente
//   - Badge "🔒 Confidencial" visível para perfis autorizados
//   - onDelete adicionado à interface (existia em AtividadesConsultar mas faltava aqui)
//   - Labels de risco normalizados: Mínimo/Baixo/Moderado/Alto/Crítico

import React from 'react';
import { Lock } from 'lucide-react';
import { Consultant, ConsultantReport } from '@/types';

interface MonthlyReportsModalProps {
  consultant: Consultant;
  month: number;
  reports: ConsultantReport[];
  onClose: () => void;
  onEdit?: (report: ConsultantReport) => void;
  onDelete?: (reportId: string) => void;
  currentUserName?: string;
  /** Tipo do usuário logado — controla visibilidade de conteúdo confidencial */
  tipoUsuario?: string;
}

/** Perfis que NÃO podem ver conteúdo marcado como confidencial */
const PERFIS_SEM_ACESSO_CONFIDENCIAL = ['Consulta', 'Cliente'];

const months = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MonthlyReportsModal: React.FC<MonthlyReportsModalProps> = ({
  consultant,
  month,
  reports,
  onClose,
  onEdit,
  onDelete,
  currentUserName,
  tipoUsuario,
}) => {
  const podeVerConfidencial = !PERFIS_SEM_ACESSO_CONFIDENCIAL.includes(tipoUsuario ?? '');

  // v2.0: Verificar se relatório é do mês atual
  const isCurrentMonth = (reportMonth: number | undefined, reportYear: number | undefined): boolean => {
    if (!reportMonth || !reportYear) return false;
    const now = new Date();
    return reportMonth === (now.getMonth() + 1) && reportYear === now.getFullYear();
  };

  const formatShortDate = (dateString: string | undefined) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });
    } catch {
      return null;
    }
  };

  const formatCreatedDate = (dateString: string | undefined) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  };

  const formatReportPeriod = (reportMonth: number | undefined, reportYear: number | undefined) => {
    if (reportMonth && reportYear) return `${months[reportMonth - 1]} de ${reportYear}`;
    if (reportMonth) return months[reportMonth - 1];
    return null;
  };

  const getRiskLabel = (score: number): string => {
    const labels: { [key: number]: string } = {
      1: 'Mínimo',
      2: 'Baixo',
      3: 'Moderado',
      4: 'Alto',
      5: 'Crítico',
    };
    return labels[score] || 'N/A';
  };

  const getRiskBadgeClass = (score: number): string => {
    if (score === 1) return 'bg-blue-100 text-blue-800';
    if (score === 2) return 'bg-green-100 text-green-800';
    if (score === 3) return 'bg-yellow-100 text-yellow-800';
    if (score === 4) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="bg-indigo-600 text-white p-4 rounded-t-lg">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Histórico de Atividades - {months[month - 1]}</h2>
            <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl">
              &times;
            </button>
          </div>
          <div className="mt-2">
            <p className="font-semibold">{consultant.nome_consultores}</p>
            <p className="text-sm opacity-90">{consultant.cargo_consultores || 'Cargo não informado'}</p>
          </div>
        </div>

        {/* Corpo */}
        <div className="p-6 overflow-y-auto flex-grow">
          <div className="bg-indigo-500 text-white p-3 rounded-md mb-6">
            <p>{reports.length} relatório(s) encontrado(s)</p>
          </div>

          {reports.length > 0 ? (
            <div className="space-y-4">
              {reports.map((report: any) => {
                const reportMonth = report.month;
                const reportYear = report.year;
                const reportPeriod = formatReportPeriod(reportMonth, reportYear);
                const createdDate = formatCreatedDate(report.created_at);
                // Priorizar risco_analista (eleito pelo analista) sobre risk_score (IA)
                const riskScore = report.risco_analista ?? report.risk_score;
                const isConfidencial = !!report.confidencial;

                // Relatório confidencial sem acesso
                if (isConfidencial && !podeVerConfidencial) {
                  return (
                    <div
                      key={report.id}
                      className="border-2 border-dashed border-red-200 rounded-lg p-4 flex items-center gap-3 bg-gray-50"
                    >
                      <div className="bg-red-100 p-2 rounded-lg flex-shrink-0">
                        <Lock className="w-5 h-5 text-red-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-red-700">
                          🔒 Relatório Confidencial
                        </p>
                        {reportPeriod && (
                          <p className="text-xs text-gray-500 mt-0.5">📅 Período: {reportPeriod}</p>
                        )}
                        {createdDate && (
                          <p className="text-xs text-gray-400">Registrado em: {createdDate}</p>
                        )}
                        <p className="text-xs text-red-400 mt-1">
                          O conteúdo é restrito e não está disponível para o seu perfil.
                        </p>
                      </div>
                    </div>
                  );
                }

                // Exibição normal
                const conteudoExibir = report.content || report.summary || 'Nenhum conteúdo disponível.';

                return (
                  <div key={report.id} className="border border-gray-200 rounded-lg p-4">
                    {/* Período + data */}
                    <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-3">
                      {reportPeriod && (
                        <p className="flex items-center gap-1">
                          <span className="font-medium text-indigo-600">📅 PERÍODO:</span>
                          <span className="text-gray-700 font-semibold">{reportPeriod}</span>
                        </p>
                      )}
                      {createdDate && (
                        <p className="flex items-center gap-1">
                          <span className="text-gray-400">Registrado em:</span>
                          <span>{createdDate}</span>
                        </p>
                      )}
                      {/* Badge Confidencial — visível para autorizados */}
                      {isConfidencial && podeVerConfidencial && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full border border-red-200">
                          <Lock className="w-3 h-3" />
                          Confidencial
                        </span>
                      )}
                    </div>

                    {/* Score de Risco */}
                    {riskScore && (
                      <div className="mb-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskBadgeClass(
                            riskScore
                          )}`}
                        >
                          Risco: {riskScore} - {getRiskLabel(riskScore)}
                        </span>
                      </div>
                    )}

                    {/* Conteúdo do relatório */}
                    <h3 className="font-bold text-gray-800 mb-2">Relatório de Atividade</h3>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {conteudoExibir}
                    </div>

                    {/* Resumo da IA separado */}
                    {report.summary && report.content && report.summary !== report.content && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="text-xs font-semibold text-blue-700 uppercase mb-1">
                          🤖 Resumo da IA
                        </h4>
                        <p className="text-sm text-blue-800">{report.summary}</p>
                      </div>
                    )}

                    {/* Padrão Negativo */}
                    {report.negative_pattern && report.negative_pattern !== 'Nenhum' && (
                      <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                        <span className="font-medium text-amber-700">⚠️ Padrão Identificado:</span>
                        <p className="text-amber-600 mt-1">{report.negative_pattern}</p>
                      </div>
                    )}

                    {/* Alerta Preditivo */}
                    {report.predictive_alert && report.predictive_alert !== 'Nenhum' && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm">
                        <span className="font-medium text-red-700">🔮 Alerta Preditivo:</span>
                        <p className="text-red-600 mt-1">{report.predictive_alert}</p>
                      </div>
                    )}

                    {/* Rodapé: Criado por / Alterado por / Botões */}
                    <div className="mt-4 pt-3 border-t border-gray-200 flex flex-wrap justify-between items-center gap-2">
                      <div className="text-xs text-gray-500 space-y-1">
                        {(report.criado_por || report.created_at) && (
                          <p>
                            <span className="font-medium">Criado por:</span>{' '}
                            {report.criado_por || 'Sistema'}
                            {report.created_at && ` em ${formatShortDate(report.created_at)}`}
                          </p>
                        )}
                        {report.alterado_por && report.data_alteracao && (
                          <p>
                            <span className="font-medium">Alterado por:</span>{' '}
                            {report.alterado_por} em {formatShortDate(report.data_alteracao)}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {/* Botão Editar — mês atual */}
                        {onEdit && isCurrentMonth(reportMonth, reportYear) && (
                          <button
                            onClick={() => onEdit(report)}
                            className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-lg hover:bg-amber-200 transition flex items-center gap-1"
                          >
                            ✏️ Editar
                          </button>
                        )}

                        {/* Botão Excluir — mês atual */}
                        {onDelete && isCurrentMonth(reportMonth, reportYear) && (
                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Tem certeza que deseja excluir este relatório de ${
                                    reportPeriod || 'período não identificado'
                                  }?`
                                )
                              ) {
                                onDelete(report.id);
                              }
                            }}
                            className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-medium rounded-lg hover:bg-red-200 transition flex items-center gap-1"
                          >
                            🗑️ Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-gray-500">Nenhum relatório detalhado encontrado para este mês.</p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="p-4 bg-gray-50 rounded-b-lg border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default MonthlyReportsModal;
