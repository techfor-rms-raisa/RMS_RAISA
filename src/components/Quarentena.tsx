import React, { useMemo, useState } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantReport } from '../components/types';
import ReportDetailsModal from './ReportDetailsModal';
import './Quarentena.css';

interface QuarentenaProps {
  consultants: Consultant[];
  clients: Client[];
  usuariosCliente: UsuarioCliente[];
  coordenadoresCliente: CoordenadorCliente[];
  currentUser: User;
}

interface Recommendation {
  category: 'Atenção' | 'Feedback' | 'Treinamento' | 'Acompanhamento';
  description: string;
}

const Quarentena: React.FC<QuarentenaProps> = ({ 
  consultants = [], 
  clients = [], 
  usuariosCliente = [], 
  coordenadoresCliente = [],
  currentUser 
}) => {
  
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [selectedScore, setSelectedScore] = useState<string>('all');
  const [viewingReport, setViewingReport] = useState<ConsultantReport | null>(null);
  const [selectedConsultantForHistory, setSelectedConsultantForHistory] = useState<Consultant | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // ============================================================================
  // FUNÇÕES AUXILIARES
  // ============================================================================

  const getDaysSinceHiring = (hireDate: string | null | undefined): number | null => {
    if (!hireDate) return null;
    try {
      const hire = new Date(hireDate);
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - hire.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  };

  const isNewConsultant = (consultant: Consultant): boolean => {
    const daysSinceHiring = getDaysSinceHiring(consultant.data_inclusao_consultores);
    return daysSinceHiring !== null && daysSinceHiring < 45;
  };

  const getValidFinalScore = (consultant: Consultant): number | null => {
    const score = consultant.parecer_final_consultor;
    if (score === null || score === undefined || score === '#FFFF') {
      return null;
    }
    const numScore = typeof score === 'string' ? parseInt(score, 10) : score;
    if (isNaN(numScore) || numScore < 1 || numScore > 5) {
      return null;
    }
    return numScore;
  };

  const isInQuarantine = (consultant: Consultant): boolean => {
    const finalScore = getValidFinalScore(consultant);
    const isNew = isNewConsultant(consultant);
    const hasRiskScore = finalScore !== null && [5, 4, 3].includes(finalScore);
    const result = hasRiskScore || isNew;
    
    // DEBUG: Mostrar consultores FORA do range
    if (!result) {
      const daysSinceHiring = getDaysSinceHiring(consultant.data_inclusao_consultores);
      console.log(`[Quarentena-Filter] ❌ FORA DO RANGE: ${consultant.nome_consultores}`, {
        finalScore,
        isNew,
        hasRiskScore,
        daysSinceHiring,
        status: consultant.status
      });
    }
    
    return result;
  };
  // Obter relatórios dos últimos 90 dias
  const get90DaysReports = (consultant: Consultant): ConsultantReport[] => {
    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    // 1️⃣ PRIORIDADE: Buscar dados do Supabase (consultant_reports)
    if (consultant.consultant_reports && Array.isArray(consultant.consultant_reports) && consultant.consultant_reports.length > 0) {
      return consultant.consultant_reports
        .filter(r => {
          try {
            const reportDate = new Date(r.created_at || '');
            return reportDate >= ninetyDaysAgo && reportDate <= today;
          } catch {
            return false;
          }
        })
        .sort((a, b) => {
          const dateA = new Date(a.created_at || '');
          const dateB = new Date(b.created_at || '');
          return dateB.getTime() - dateA.getTime(); // Maior data primeiro
        });
    }
    
    // 2️⃣ FALLBACK: Dados locais (consultant.reports)
    if (consultant.reports && Array.isArray(consultant.reports) && consultant.reports.length > 0) {
      return consultant.reports
        .filter(r => {
          try {
            const reportDate = new Date(r.data_relatorio || r.created_at || '');
            return reportDate >= ninetyDaysAgo && reportDate <= today;
          } catch {
            return false;
          }
        })
        .sort((a, b) => {
          const dateA = new Date(a.data_relatorio || a.created_at || '');
          const dateB = new Date(b.data_relatorio || b.created_at || '');
          return dateB.getTime() - dateA.getTime(); // Maior data primeiro
        });
    }
    
    // 3️⃣ FALLBACK FINAL: Retornar array vazio
    return [];
  };
  // Abrir modal de histórico ao clicar no badge
  const handleScoreBadgeClick = (consultant: Consultant) => {
    setSelectedConsultantForHistory(consultant);
    setShowHistoryModal(true);
  };



  const getScoreColor = (score: number | null): string => {
    if (score === null || score === undefined) return '#757575';
    const colors: { [key: number]: string } = {
      5: '#d32f2f',
      4: '#f57c00',
      3: '#fbc02d',
      2: '#388e3c',
      1: '#1976d2'
    };
    return colors[score] || '#757575';
  };

  const getScoreLabel = (score: number | null): string => {
    if (score === null || score === undefined) return '';
    const labels: { [key: number]: string } = {
      5: 'CRÍTICO',
      4: 'ALTO',
      3: 'MODERADO',
      2: 'BAIXO',
      1: 'MÍNIMO'
    };
    return labels[score] || 'DESCONHECIDO';
  };

  const getCategoryClassName = (category: string): string => {
    const classMap: { [key: string]: string } = {
      'Atenção': 'atencao',
      'Feedback': 'feedback',
      'Treinamento': 'treinamento',
      'Acompanhamento': 'acompanhamento'
    };
    return classMap[category] || 'default';
  };

  // Extrair recomendações do campo recommendations (JSONB)
  const getRecommendations = (consultant: Consultant): Recommendation[] => {
    try {
      if (!consultant.recommendations) return [];
      const recs = typeof consultant.recommendations === 'string' 
        ? JSON.parse(consultant.recommendations) 
        : consultant.recommendations;
      
      if (Array.isArray(recs)) {
        return recs
          .filter((rec: any) => ['Atenção', 'Feedback', 'Treinamento', 'Acompanhamento'].includes(rec.category))
          .map((rec: any) => ({
            category: rec.category as 'Atenção' | 'Feedback' | 'Treinamento' | 'Acompanhamento',
            description: rec.description || ''
          }));
      }
      return [];
    } catch {
      return [];
    }
  }
  // Gerar recomendações baseadas no score
  const generateRecommendationsByScore = (score: number): { tipo: string; descricao: string }[] => {
    if (score === 5) {
      return [
        { tipo: 'URGENTE', descricao: 'Reunião imediata com gestor e RH' },
        { tipo: 'PLANO DE AÇÃO', descricao: 'Criar plano de recuperação em 48h' },
        { tipo: 'MONITORAMENTO', descricao: 'Acompanhamento semanal obrigatório' },
        { tipo: 'SUPORTE', descricao: 'Alocar mentor/coach especializado' }
      ];
    } else if (score === 4) {
      return [
        { tipo: 'ATENÇÃO', descricao: 'Agendar reunião com gestor em 1 semana' },
        { tipo: 'FEEDBACK', descricao: 'Sessão de feedback estruturado' },
        { tipo: 'TREINAMENTO', descricao: 'Identificar necessidades de capacitação' },
        { tipo: 'ACOMPANHAMENTO', descricao: 'Monitoramento Semanal (recomendado pela IA)' }
      ];
    } else if (score === 3) {
      return [
        { tipo: 'OBSERVAÇÃO', descricao: 'Conversa informal com gestor' },
        { tipo: 'DESENVOLVIMENTO', descricao: 'Oferecer oportunidades de melhoria' },
        { tipo: 'SUPORTE', descricao: 'Disponibilizar recursos adicionais' },
        { tipo: 'PREVENTIVO', descricao: 'Monitoramento Semanal' }
      ];
    } else if (score === 2) {
      return [
        { tipo: 'RECONHECIMENTO', descricao: 'Reconhecer bom desempenho' },
        { tipo: 'CRESCIMENTO', descricao: 'Explorar oportunidades de desenvolvimento' },
        { tipo: 'MANUTENÇÃO', descricao: 'Manter nível de suporte atual' }
      ];
    } else if (score === 1) {
      return [
        { tipo: 'DESTAQUE', descricao: 'Reconhecimento público do desempenho' },
        { tipo: 'LIDERANÇA', descricao: 'Considerar para posições de liderança' },
        { tipo: 'MENTORIA', descricao: 'Convidar para mentorar outros consultores' },
        { tipo: 'RETENÇÃO', descricao: 'Plano de carreira e retenção de talento' }
      ];
    }
    return [{ tipo: 'AVALIAR', descricao: 'Realizar avaliação de desempenho' }];
  };
;

  // ============================================================================
  // LÓGICA DE ESTRUTURA DE DADOS
  // ============================================================================

  const structuredData = useMemo(() => {
    let relevantClients = clients.filter(c => c.ativo_cliente);
    if (selectedClient !== 'all') {
      relevantClients = relevantClients.filter(c => c.razao_social_cliente === selectedClient);
    }

    return relevantClients.map(client => {
      const clientManagers = usuariosCliente.filter(uc => uc.id_cliente === client.id);
      
      const managers = clientManagers.map(manager => {
        let managerConsultants = consultants.filter(c => c.gestor_imediato_id === manager.id && c.status === 'Ativo');
        
        // Filtrar apenas consultores em quarentena
        managerConsultants = managerConsultants.filter(c => isInQuarantine(c));

        // Aplicar filtro de score selecionado
        if (selectedScore !== 'all') {
          if (selectedScore === 'new') {
            managerConsultants = managerConsultants.filter(c => isNewConsultant(c));
          } else {
            const scoreNum = parseInt(selectedScore, 10);
            managerConsultants = managerConsultants.filter(c => getValidFinalScore(c) === scoreNum);
          }
        }

        if (managerConsultants.length === 0) return null;
        
        return {
          ...manager,
          consultants: managerConsultants.sort((a, b) => a.nome_consultores.localeCompare(b.nome_consultores)),
          coordenadores: coordenadoresCliente.filter(cc => cc.id_gestor_cliente === manager.id && cc.ativo),
        };
      }).filter((m): m is Exclude<typeof m, null> => m !== null);

      return { ...client, managers };
    }).sort((a, b) => a.razao_social_cliente.localeCompare(b.razao_social_cliente));
  }, [clients, consultants, usuariosCliente, coordenadoresCliente, selectedClient, selectedScore]);

  const getReportForMonth = (c: Consultant, m: number) => {
    if (!c.reports) return undefined;
    return c.reports.filter(r => r.month === m).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  };

  // Remover warning de getReportForMonth não utilizado
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = getReportForMonth;

  // ============================================================================
  // RENDER
  // ============================================================================

  if (consultants.length === 0 || clients.length === 0) {
    return <div className="p-6 text-center text-gray-500">Carregando dados do Supabase...</div>;
  }

  return (
    <div className="quarentena-container">
      <div className="quarentena-header">
        <h2 className="quarentena-title">🚨 Quarentena de Consultores</h2>
      </div>
      
      {/* Filtros */}
      <div className="quarentena-filters">
        <div className="filter-group">
          <label className="filter-label">Filtrar por Cliente:</label>
          <select 
            value={selectedClient} 
            onChange={e => setSelectedClient(e.target.value)} 
            className="filter-select"
          >
            <option value="all">Todos os Clientes</option>
            {[...new Set(clients.map(c => c.razao_social_cliente))].sort().map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Filtrar por Score:</label>
          <select 
            value={selectedScore} 
            onChange={e => setSelectedScore(e.target.value)} 
            className="filter-select"
          >
            <option value="all">Todos os Scores</option>
            <option value="5">Score 5 - CRÍTICO</option>
            <option value="4">Score 4 - ALTO</option>
            <option value="3">Score 3 - MODERADO</option>
            <option value="new">Novo Consultor (&lt; 45 dias)</option>
          </select>
        </div>
      </div>

      {/* Resultados - Containers de Cards */}
      <div className="quarentena-results">
        {structuredData.map(client => (
          (client.managers.length > 0) && (
            <div key={client.id} className="client-section">
              <h2 className="client-title">{client.razao_social_cliente}</h2>
              
              {client.managers.map(manager => (
                <div key={manager.id} className="manager-section">
                  <h3 className="manager-title">{manager.nome_gestor_cliente}</h3>
                  
                  <div className="consultants-grid">
                    {manager.consultants.map(consultant => {
                      const finalScore = getValidFinalScore(consultant);
                      const isNew = isNewConsultant(consultant);
                      const daysSinceHiring = getDaysSinceHiring(consultant.data_inclusao_consultores);
                      const clientInfo = clients.find(c => c.id === consultant.id_cliente);
                      const coordenador = coordenadoresCliente.find(cc => cc.id_cliente === consultant.id_cliente);
                      const recommendations = getRecommendations(consultant);

                      return (
                        <div 
                          key={consultant.id} 
                          className="consultant-container"
                          style={{ borderLeftColor: getScoreColor(finalScore) }}
                        >
                          {/* Header com Informações e Score */}
                          <div className="consultant-header-wrapper">
                            {/* Seção de Informações */}
                            <div className="consultant-info-section">
                              <div className="consultant-header-info">
                                <h3 className="consultant-name">
                                  {consultant.nome_consultores}
                                </h3>
                                <p className="consultant-profession">{consultant.cargo_consultores || 'N/A'}</p>
                              </div>

                              <div className="consultant-details-grid-single">
                                <div className="detail-item">
                                  <span className="detail-label">E-mail:</span>
                                  <span className="detail-value">{consultant.email_consultor || 'N/A'}</span>
                                </div>
                                <div className="detail-item">
                                  <span className="detail-label">Cliente:</span>
                                  <span className="detail-value">{clientInfo?.razao_social_cliente || 'N/A'}</span>
                                </div>
                                <div className="detail-item">
                                  <span className="detail-label">Gestor:</span>
                                  <span className="detail-value">{manager.nome_gestor_cliente || 'N/A'}</span>
                                </div>
                                <div className="detail-item">
                                  <span className="detail-label">Coordenador:</span>
                                  <span className="detail-value">{coordenador?.nome_coordenador || 'N/A'}</span>
                                </div>
                              </div>

                              {/* Recomendações Inline */}
                              {finalScore !== null && (
                                <div className="recommendations-inline">
                                  <h4 className="recommendations-inline-title">⚡ Recomendações de Ação:</h4>
                                  <div className="recommendations-inline-grid">
                                    {generateRecommendationsByScore(finalScore).map((rec, idx) => (
                                      <div key={idx} className="recommendation-inline-card">
                                        <div className="recommendation-inline-tipo">{rec.tipo}</div>
                                        <div className="recommendation-inline-descricao">{rec.descricao}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Score Badge - Lado Direito */}
                            <div className="consultant-score-section">
                              <div className="score-info">
                                {isNew && daysSinceHiring && (
                                  <div className="contratado-info">
                                    <span className="contratado-label">Contratado:</span>
                                    <span className="contratado-dias">{daysSinceHiring} dias</span>
                                  </div>
                                )}
                                {finalScore !== null ? (
                                  <button 
                                    className="score-badge score-badge-button"
                                    style={{ backgroundColor: getScoreColor(finalScore) }}
                                    onClick={() => handleScoreBadgeClick(consultant)}
                                    title="Clique para ver histórico de atividades"
                                  >
                                    <span className="score-label-text">RISCO</span>
                                    <span className="score-label-text">{getScoreLabel(finalScore)}</span>
                                    <span className="score-number">Score {finalScore}</span>
                                  </button>
                                ) : (
                                  <button 
                                    className="score-badge score-badge-button"
                                    style={{ backgroundColor: '#fbc02d' }}
                                    onClick={() => handleScoreBadgeClick(consultant)}
                                    title="Clique para ver histórico de atividades"
                                  >
                                    <span className="score-label-text">RISCO</span>
                                    <span className="score-label-text">MODERADO</span>
                                    <span className="score-number">Score 3</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Seção de Recomendações */}
                          {recommendations.length > 0 && (
                            <div className="recommendations-section">
                              <h4 className="recommendations-title">⚡ Recomendações de Ação:</h4>
                              <div className="recommendations-grid-2x2">
                                {recommendations.map((rec, idx) => (
                                  <div 
                                    key={idx} 
                                    className={`recommendation-card recommendation-${getCategoryClassName(rec.category)}`}
                                  >
                                    <div className="recommendation-category">{rec.category.toUpperCase()}</div>
                                    <div className="recommendation-description">{rec.description}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        ))}
      </div>

      {structuredData.every(c => c.managers.length === 0) && (
        <div className="empty-state">
          <p className="empty-state-text">✅ Nenhum consultor em quarentena com os filtros selecionados</p>
        </div>
      )}

      <ReportDetailsModal report={viewingReport} onClose={() => setViewingReport(null)} isQuarentineView={true} />

      {/* Modal de Histórico de Atividades */}
      {showHistoryModal && selectedConsultantForHistory && (
        <div className="history-modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="history-modal-header">
              <h3>Histórico de Atividades - {selectedConsultantForHistory.nome_consultores}</h3>
              <button className="history-modal-close" onClick={() => setShowHistoryModal(false)}>×</button>
            </div>
            
            <div className="history-modal-body">
              {get90DaysReports(selectedConsultantForHistory).length > 0 ? (
                <div className="history-list">
                  {get90DaysReports(selectedConsultantForHistory).map((report, idx) => (
                    <div key={idx} className="history-item">
                      <div className="history-item-date">
                        {new Date(report.data_relatorio || report.created_at || "").toLocaleDateString("pt-BR")}
                      </div>
                      <div className="history-item-content">
                        <div className="history-item-title">{report.titulo || "Relatório de Atividade"}</div>
                        {report.summary && (
                          <div className="history-item-summary">{report.summary}</div>
                        )}
                        {report.riskScore && (
                          <div className="history-item-risk">
                            <span className="risk-badge" style={{ backgroundColor: getScoreColor(report.riskScore) }}>
                              Score {report.riskScore}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="history-empty">
                  <p>Nenhuma atividade nos últimos 90 dias</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Quarentena;
