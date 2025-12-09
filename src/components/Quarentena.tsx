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
    return hasRiskScore || isNew;
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
  };

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
                          {/* Seção de Informações */}
                          <div className="consultant-info-section">
                            <div className="consultant-header-info">
                              <h3 className="consultant-name">
                                {consultant.nome_consultores}
                                {isNew && (
                                  <span 
                                    className="badge-novo"
                                    title={`Contratado há ${daysSinceHiring} dias`}
                                  >
                                    🆕 Novo
                                  </span>
                                )}
                              </h3>
                              <p className="consultant-profession">{consultant.cargo_consultores || 'N/A'}</p>
                            </div>

                            <div className="consultant-details-grid">
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
                          </div>

                          {/* Score Badge */}
                          <div className="consultant-score-section">
                            {finalScore !== null ? (
                              <div 
                                className="score-badge"
                                style={{ backgroundColor: getScoreColor(finalScore) }}
                              >
                                <span className="score-label-text">{getScoreLabel(finalScore)}</span>
                                <span className="score-number">Score {finalScore}</span>
                              </div>
                            ) : (
                              <div className="score-badge score-unknown">
                                <span className="score-label-text">DESCONHECIDO</span>
                                <span className="score-number">-</span>
                              </div>
                            )}
                          </div>

                          {/* Seção de Recomendações */}
                          {recommendations.length > 0 && (
                            <div className="recommendations-section">
                              <h4 className="recommendations-title">⚡ Recomendações de Ação:</h4>
                              <div className="recommendations-grid">
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
    </div>
  );
};

export default Quarentena;
