import React, { useState, useMemo } from 'react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { Consultant, Client } from './types';
import '../index.css'; // Estilos globais

interface QuarentenaFilters {
  clientId: string | null;
  scoreFilter: string | null; // 'all', '5', '4', '3', 'new' (novo consultor < 45 dias)
}

export const Quarentena: React.FC = () => {
  const { consultants, clients } = useSupabaseData();
  const [filters, setFilters] = useState<QuarentenaFilters>({
    clientId: null,
    scoreFilter: 'all'
  });

  // ============================================================================
  // FUNÇÕES AUXILIARES
  // ============================================================================

  /**
   * Calcular dias desde contratação
   */
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

  /**
   * Verificar se consultor é "Novo" (< 45 dias)
   */
  const isNewConsultant = (consultant: Consultant): boolean => {
    const daysSinceHiring = getDaysSinceHiring(consultant.data_inclusao_consultores);
    return daysSinceHiring !== null && daysSinceHiring < 45;
  };

  /**
   * Obter score final válido
   */
  const getValidFinalScore = (consultant: Consultant): number | null => {
    const score = consultant.parecer_final_consultor;
    
    // Excluir scores inválidos
    if (score === null || score === undefined || score === '#FFFF') {
      return null;
    }
    
    // Converter para número se for string
    const numScore = typeof score === 'string' ? parseInt(score, 10) : score;
    
    // Validar se é número entre 1-5
    if (isNaN(numScore) || numScore < 1 || numScore > 5) {
      return null;
    }
    
    return numScore;
  };

  /**
   * Verificar se consultor deve estar em quarentena
   */
  const isInQuarantine = (consultant: Consultant): boolean => {
    const finalScore = getValidFinalScore(consultant);
    const isNew = isNewConsultant(consultant);
    
    // Score 5, 4 ou 3
    const hasRiskScore = finalScore !== null && [5, 4, 3].includes(finalScore);
    
    // Novo consultor (< 45 dias)
    const isNewWithinPeriod = isNew;
    
    // Deve estar em quarentena se: (tem score de risco) OU (é novo consultor)
    return hasRiskScore || isNewWithinPeriod;
  };

  /**
   * Obter label do score
   */
  const getScoreLabel = (score: number): string => {
    const labels: { [key: number]: string } = {
      5: 'CRÍTICO',
      4: 'ALTO',
      3: 'MODERADO',
      2: 'BAIXO',
      1: 'MÍNIMO'
    };
    return labels[score] || 'DESCONHECIDO';
  };

  /**
   * Obter cor do score
   */
  const getScoreColor = (score: number): string => {
    const colors: { [key: number]: string } = {
      5: '#d32f2f', // Vermelho escuro
      4: '#f57c00', // Laranja
      3: '#fbc02d', // Amarelo
      2: '#388e3c', // Verde
      1: '#1976d2'  // Azul
    };
    return colors[score] || '#757575';
  };

  /**
   * Obter cliente pelo ID
   */
  const getClientName = (clientId: number | null): string => {
    if (!clientId) return 'N/A';
    const client = clients?.find(c => c.id === clientId);
    return client?.razao_social_cliente || 'N/A';
  };

  // ============================================================================
  // LÓGICA DE FILTROS
  // ============================================================================

  const filteredConsultants = useMemo(() => {
    return consultants.filter(consultant => {
      // 1. Verificar se deve estar em quarentena
      if (!isInQuarantine(consultant)) {
        return false;
      }

      // 2. Filtrar por cliente
      if (filters.clientId && consultant.gestor_imediato_id?.toString() !== filters.clientId) {
        return false;
      }

      // 3. Filtrar por score
      if (filters.scoreFilter !== 'all') {
        const finalScore = getValidFinalScore(consultant);
        const isNew = isNewConsultant(consultant);

        if (filters.scoreFilter === 'new') {
          // Mostrar apenas novos consultores
          if (!isNew) return false;
        } else {
          // Mostrar apenas score específico
          const scoreNum = parseInt(filters.scoreFilter, 10);
          if (finalScore !== scoreNum) return false;
        }
      }

      return true;
    });
  }, [consultants, filters]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleClientFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFilters(prev => ({
      ...prev,
      clientId: value ? value : null
    }));
  };

  const handleScoreFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFilters(prev => ({
      ...prev,
      scoreFilter: value
    }));
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🚨 Quarentena de Consultores</h1>
      
      {/* Filtros */}
      <div style={styles.filters}>
        <div style={styles.filterGroup}>
          <label htmlFor="client-filter" style={styles.label}>Filtrar por Cliente:</label>
          <select
            id="client-filter"
            value={filters.clientId || ''}
            onChange={handleClientFilterChange}
            style={styles.select}
          >
            <option value="">Todos os Clientes</option>
            {clients?.map(client => (
              <option key={client.id} value={client.id}>
                {client.razao_social_cliente}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.filterGroup}>
          <label htmlFor="score-filter" style={styles.label}>Filtrar por Score:</label>
          <select
            id="score-filter"
            value={filters.scoreFilter || 'all'}
            onChange={handleScoreFilterChange}
            style={styles.select}
          >
            <option value="all">Todos os Scores</option>
            <option value="5">Score 5 - CRÍTICO</option>
            <option value="4">Score 4 - ALTO</option>
            <option value="3">Score 3 - MODERADO</option>
            <option value="new">Novo Consultor (&lt; 45 dias)</option>
          </select>
        </div>
      </div>

      {/* Resultados */}
      <div style={styles.results}>
        <p style={styles.resultCount}>
          Total: <strong style={styles.bold}>{filteredConsultants.length}</strong> consultor(es) em quarentena
        </p>

        {filteredConsultants.length === 0 ? (
          <div style={styles.noResults}>
            <p>✅ Nenhum consultor em quarentena com os filtros selecionados</p>
          </div>
        ) : (
          <div style={styles.grid}>
            {filteredConsultants.map(consultant => {
              const finalScore = getValidFinalScore(consultant);
              const isNew = isNewConsultant(consultant);
              const daysSinceHiring = getDaysSinceHiring(consultant.data_inclusao_consultores);
              const clientName = getClientName(consultant.gestor_imediato_id);

              return (
                <div key={consultant.id} style={styles.card}>
                  {/* Cabeçalho com Nome e Badges */}
                  <div style={styles.cardHeader}>
                    <div style={styles.nameSection}>
                      <h3 style={styles.consultantName}>
                        {consultant.nome_consultores}
                      </h3>
                      
                      {/* Badge "Novo Consultor" */}
                      {isNew && (
                        <span 
                          style={styles.badgeNew}
                          title={`Contratado há ${daysSinceHiring} dias`}
                        >
                          🆕 Novo
                        </span>
                      )}
                    </div>

                    {/* Score Badge */}
                    {finalScore !== null && (
                      <div
                        style={{
                          ...styles.scoreBadge,
                          backgroundColor: getScoreColor(finalScore)
                        }}
                      >
                        <span style={styles.scoreNumber}>{finalScore}</span>
                        <span style={styles.scoreLabel}>{getScoreLabel(finalScore)}</span>
                      </div>
                    )}
                  </div>

                  {/* Informações */}
                  <div style={styles.cardBody}>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Cargo:</span>
                      <span style={styles.infoValue}>{consultant.cargo_consultores}</span>
                    </div>

                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Email:</span>
                      <span style={styles.infoValue}>{consultant.email_consultor || 'N/A'}</span>
                    </div>

                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Cliente:</span>
                      <span style={styles.infoValue}>{clientName}</span>
                    </div>

                    {isNew && (
                      <div style={styles.infoRowHighlight}>
                        <span style={styles.infoLabel}>📅 Contratação:</span>
                        <span style={styles.infoValue}>
                          {daysSinceHiring} dias atrás
                          {daysSinceHiring && daysSinceHiring < 30 && (
                            <span style={styles.alert}> ⚠️ Menos de 30 dias</span>
                          )}
                        </span>
                      </div>
                    )}

                    {finalScore !== null && (
                      <div style={styles.infoRow}>
                        <span style={styles.infoLabel}>Score Final:</span>
                        <span style={{ ...styles.infoValue, color: getScoreColor(finalScore) }}>
                          {finalScore} - {getScoreLabel(finalScore)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Rodapé com Ações */}
                  <div style={styles.cardFooter}>
                    <button style={styles.btnDetails}>
                      📋 Ver Detalhes
                    </button>
                    <button style={styles.btnAction}>
                      ✉️ Notificar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// ESTILOS INLINE
// ============================================================================

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px',
    background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
    minHeight: '100vh'
  },
  title: {
    fontSize: '2.5rem',
    color: '#d32f2f',
    marginBottom: '32px',
    textAlign: 'center',
    textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px'
  },
  filters: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
    background: 'white',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    fontWeight: 600,
    color: '#333',
    fontSize: '0.95rem'
  },
  select: {
    padding: '12px 16px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    fontSize: '1rem',
    backgroundColor: 'white',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  results: {
    marginTop: '32px'
  },
  resultCount: {
    fontSize: '1.1rem',
    color: '#555',
    marginBottom: '20px',
    padding: '12px 16px',
    background: 'white',
    borderLeft: '4px solid #1976d2',
    borderRadius: '4px'
  },
  bold: {
    color: '#d32f2f',
    fontSize: '1.3rem'
  },
  noResults: {
    background: 'white',
    padding: '48px 24px',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
    gap: '24px',
    marginTop: '24px'
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
    borderLeft: '4px solid #d32f2f',
    display: 'flex',
    flexDirection: 'column'
  },
  cardHeader: {
    padding: '20px',
    background: 'linear-gradient(135deg, #f5f7fa 0%, #e8eef7 100%)',
    borderBottom: '2px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px'
  },
  nameSection: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap'
  },
  consultantName: {
    margin: 0,
    fontSize: '1.2rem',
    fontWeight: 700,
    color: '#1a1a1a',
    wordBreak: 'break-word'
  },
  badgeNew: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '0.85rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    background: 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)',
    color: 'white',
    boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)'
  },
  scoreBadge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '70px',
    padding: '12px',
    borderRadius: '8px',
    color: 'white',
    fontWeight: 700,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
  },
  scoreNumber: {
    fontSize: '1.8rem',
    lineHeight: 1,
    marginBottom: '4px'
  },
  scoreLabel: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  cardBody: {
    padding: '20px',
    flex: 1
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid #f0f0f0'
  },
  infoRowHighlight: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    background: '#fff3e0',
    padding: '12px',
    borderRadius: '6px',
    borderLeft: '3px solid #ff9800',
    marginBottom: '12px'
  },
  infoLabel: {
    fontWeight: 600,
    color: '#666',
    fontSize: '0.9rem',
    minWidth: '100px'
  },
  infoValue: {
    color: '#333',
    fontSize: '0.95rem',
    textAlign: 'right',
    flex: 1,
    wordBreak: 'break-word'
  },
  alert: {
    color: '#d32f2f',
    fontWeight: 600,
    marginLeft: '8px'
  },
  cardFooter: {
    padding: '16px 20px',
    background: '#f9f9f9',
    borderTop: '1px solid #e0e0e0',
    display: 'flex',
    gap: '12px'
  },
  btnDetails: {
    flex: 1,
    padding: '10px 16px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textAlign: 'center',
    background: '#1976d2',
    color: 'white'
  },
  btnAction: {
    flex: 1,
    padding: '10px 16px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textAlign: 'center',
    background: '#ff9800',
    color: 'white'
  }
};

export default Quarentena;
