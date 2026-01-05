import React, { useState, useMemo, useEffect } from 'react';
import { Mail, Phone } from 'lucide-react';
import { FocalRSIcon } from './icons/FocalRSIcon';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantReport } from '@/types';
import ReportDetailsModal from './ReportDetailsModal';
import HistoricoAtividadesModal from './HistoricoAtividadesModal';
import RecommendationsModal from './RecommendationsModal';
import { loadRecommendationsFromSupabase, IntelligentAnalysis } from '../services/supabaseRecommendationService';
// ✅ CORRIGIDO: Usar recomendações persistidas no Supabase em vez de chamar API Gemini

import './Quarentena.css';

interface QuarentenaProps {
  consultants: Consultant[];
  clients: Client[];
  usuariosCliente: UsuarioCliente[];
  coordenadoresCliente: CoordenadorCliente[];
  currentUser: User;
  users?: User[]; // ✅ NOVO: Lista de todos os usuários do sistema para filtro
  loadConsultantReports: (consultantId: number) => Promise<ConsultantReport[]>;
  onNavigateToAtividades: (clientName?: string, consultantName?: string) => void;
  onNavigateToRecommendations?: (consultant: Consultant) => void;
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
  currentUser,
  users = [], // ✅ NOVO: Lista de todos os usuários
  loadConsultantReports,
  onNavigateToAtividades,
  onNavigateToRecommendations
}) => {
  
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [selectedScore, setSelectedScore] = useState<string>('all');
  const [selectedManager, setSelectedManager] = useState<string>('all'); // ✅ CORRIGIDO: Filtro por ID do Gestor de Pessoas
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear()); // ✅ v2.4: Filtro de ano
  const [viewingReport, setViewingReport] = useState<ConsultantReport | null>(null);
  const [selectedConsultantForHistory, setSelectedConsultantForHistory] = useState<Consultant | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [loadedReports, setLoadedReports] = useState<ConsultantReport[]>([]);

  // ============================================
  // ✅ NOVO: ESTADOS PARA MODAL DE RECOMENDAÇÕES
  // ============================================
  const [showRecommendationsModal, setShowRecommendationsModal] = useState<boolean>(false);
  const [selectedConsultantForRecommendations, setSelectedConsultantForRecommendations] = useState<Consultant | null>(null);
  const [selectedRecommendations, setSelectedRecommendations] = useState<IntelligentAnalysis | null>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState<boolean>(false);

  // ✅ v2.4: Anos disponíveis
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const uniqueYears = new Set<number>();
    consultants.forEach(c => {
      if (c.ano_vigencia) uniqueYears.add(c.ano_vigencia);
    });
    if (uniqueYears.size === 0) uniqueYears.add(currentYear);
    return [...uniqueYears].sort((a, b) => b - a);
  }, [consultants]);

  // ✅ v2.4: Inicializar com o ano mais recente DISPONÍVEL nos dados
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]); // Primeiro da lista = mais recente
    }
  }, [availableYears, selectedYear]);

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
    if (score === null || score === undefined || String(score) === '#FFFF') {
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

  // ✅ NOVO: Abrir modal de histórico ao clicar em "Ver Histórico"
  const handleViewHistoryClick = async (consultant: Consultant) => {
    console.log(`📋 Clique em "Ver Histórico" para ${consultant.nome_consultores}`);
    
    try {
      // 🔥 Carregar relatórios sob demanda do Supabase
      console.log(`📊 Carregando relatórios do Supabase para consultor ${consultant.id}...`);
      const reports = await loadConsultantReports(consultant.id);
      console.log(`✅ ${reports.length} relatórios carregados com sucesso`);
      
      // Armazenar relatórios no state
      setLoadedReports(reports);
      
      // Abrir modal de histórico
      setSelectedConsultantForHistory(consultant);
      setShowHistoryModal(true);
    } catch (error) {
      console.error('❌ Erro ao carregar relatórios:', error);
      // Abrir modal mesmo com erro (mostrará mensagem de vazio)
      setLoadedReports([]);
      setSelectedConsultantForHistory(consultant);
      setShowHistoryModal(true);
    }
  };

  // ============================================
  // ✅ NOVO: HANDLER PARA ABRIR MODAL DE RECOMENDAÇÕES
  // ============================================
  const handleViewRecommendations = async (consultant: Consultant) => {
    console.log(`⚡ Clique em "Ver Recomendação" para ${consultant.nome_consultores}`);
    
    setLoadingRecommendations(true);
    try {
      // ✅ CORRIGIDO: Buscar relatórios do Supabase
      const reports = await loadConsultantReports(consultant.id);
      
      // ✅ CORRIGIDO: Carregar recomendações persistidas do Supabase (não chamar Gemini)
      const analysis = loadRecommendationsFromSupabase(consultant, reports);
      
      // Armazenar dados no state
      setSelectedConsultantForRecommendations(consultant);
      setSelectedRecommendations(analysis);
      setShowRecommendationsModal(true);
      
      console.log(`✅ Recomendações carregadas para ${consultant.nome_consultores}`);
    } catch (error) {
      console.error(`❌ Erro ao carregar recomendações para ${consultant.nome_consultores}:`, error);
      // ✅ CORRIGIDO: Não mostrar alert, usar fallback silenciosamente
      setSelectedConsultantForRecommendations(consultant);
      setSelectedRecommendations({
        resumo: 'Recomendações padrão baseadas no score de risco',
        recomendacoes: []
      });
      setShowRecommendationsModal(true);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  // ============================================
  // ✅ NOVO: HANDLER PARA FECHAR MODAL DE RECOMENDAÇÕES
  // ============================================
  const handleCloseRecommendations = () => {
    setShowRecommendationsModal(false);
    setSelectedConsultantForRecommendations(null);
    setSelectedRecommendations(null);
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

  // ============================================================================
  // LÓGICA DE ESTRUTURA DE DADOS
  // ============================================================================

  const structuredData = useMemo(() => {
    let relevantClients = clients.filter(c => c.ativo_cliente);
    if (selectedClient !== 'all') {
      relevantClients = relevantClients.filter(c => c.razao_social_cliente === selectedClient);
    }

    return relevantClients.map(client => {
      let clientManagers = usuariosCliente.filter(uc => uc.id_cliente === client.id);
      
      const managers = clientManagers.map(manager => {
        // ✅ v2.4: Filtrar por gestor_imediato_id, status E ano_vigencia (tratando NULL)
        let managerConsultants = consultants.filter(c => 
          c.gestor_imediato_id === manager.id && 
          c.status === 'Ativo' &&
          (c.ano_vigencia === selectedYear || c.ano_vigencia === null || c.ano_vigencia === undefined)
        );
        
        // Filtrar apenas consultores em quarentena
        managerConsultants = managerConsultants.filter(c => isInQuarantine(c));

        // ✅ v2.5 CORRIGIDO: Filtrar por id_gestao_de_pessoas do CLIENTE (via gestor_imediato -> cliente)
        if (selectedManager !== 'all') {
          const selectedManagerId = parseInt(selectedManager, 10);
          managerConsultants = managerConsultants.filter(c => {
            // Buscar o gestor imediato do consultor
            const gestorImediato = usuariosCliente.find(uc => uc.id === c.gestor_imediato_id);
            if (!gestorImediato) return false;
            
            // Buscar o cliente do gestor imediato
            const clienteDoConsultor = clients.find(cl => cl.id === gestorImediato.id_cliente);
            if (!clienteDoConsultor) return false;
            
            // Verificar se o id_gestao_de_pessoas do cliente corresponde ao selecionado
            return Number(clienteDoConsultor.id_gestao_de_pessoas) === selectedManagerId;
          });
        }

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
  }, [clients, consultants, usuariosCliente, coordenadoresCliente, selectedClient, selectedScore, selectedManager, selectedYear]);

  const getReportForMonth = (c: Consultant, m: number) => {
    if (!c.reports) return undefined;
    return c.reports.filter(r => r.month === m).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  };

  // Remover warning de getReportForMonth não utilizado
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = getReportForMonth;

  // ============================================================================
  // ✅ v2.5: CÁLCULO DE ESTATÍSTICAS PARA CARDS TOTALIZADORES
  // ============================================================================
  const statistics = useMemo(() => {
    const stats = { total: 0, medium: 0, high: 0, critical: 0, newConsultants: 0 };
    
    // Contar todos os consultores que aparecem na estrutura de dados filtrada
    const allConsultants = structuredData.flatMap(client => 
      client.managers.flatMap(manager => manager.consultants)
    );
    
    stats.total = allConsultants.length;

    allConsultants.forEach(consultant => {
      const score = getValidFinalScore(consultant);
      if (score !== null) {
        switch (score) {
          case 3: stats.medium++; break;
          case 4: stats.high++; break;
          case 5: stats.critical++; break;
        }
      }
      // Contar novos consultores (< 45 dias)
      if (isNewConsultant(consultant)) {
        stats.newConsultants++;
      }
    });

    return stats;
  }, [structuredData]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (consultants.length === 0 || clients.length === 0) {
    return <div className="p-6 text-center text-gray-500">Carregando dados do Supabase...</div>;
  }

  return (
    <div className="quarentena-container">
      <div className="quarentena-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

        {/* ✅ CORRIGIDO: Filtro por Gestão de Pessoas (app.users) */}
        <div className="filter-group">
          <label className="filter-label">Gestão de Pessoas:</label>
          <select 
            value={selectedManager} 
            onChange={e => setSelectedManager(e.target.value)} 
            className="filter-select"
          >
            <option value="all">Todos</option>
            {users
              .filter(u => u.tipo_usuario === 'Gestão de Pessoas' && u.ativo_usuario)
              .sort((a, b) => a.nome_usuario.localeCompare(b.nome_usuario))
              .map(u => (
                <option key={u.id} value={String(u.id)}>{u.nome_usuario}</option>
              ))
            }
          </select>
        </div>

        {/* ✅ v2.4: Filtro por Ano */}
        <div className="filter-group">
          <label className="filter-label">Ano:</label>
          <select 
            value={selectedYear} 
            onChange={e => setSelectedYear(parseInt(e.target.value))} 
            className="filter-select"
          >
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ✅ v2.5: PAINEL DE ESTATÍSTICAS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gray-100 p-4 rounded-lg text-center shadow">
          <p className="text-2xl font-bold text-gray-800">{statistics.total}</p>
          <p className="text-sm text-gray-600">Em Quarentena</p>
        </div>
        <div className="bg-yellow-100 p-4 rounded-lg text-center shadow">
          <p className="text-2xl font-bold text-yellow-700">{statistics.medium}</p>
          <p className="text-sm text-yellow-700">Médio (3)</p>
        </div>
        <div className="bg-orange-100 p-4 rounded-lg text-center shadow">
          <p className="text-2xl font-bold text-orange-700">{statistics.high}</p>
          <p className="text-sm text-orange-700">Alto (4)</p>
        </div>
        <div className="bg-red-100 p-4 rounded-lg text-center shadow">
          <p className="text-2xl font-bold text-red-700">{statistics.critical}</p>
          <p className="text-sm text-red-700">Crítico (5)</p>
        </div>
        <div className="bg-purple-100 p-4 rounded-lg text-center shadow">
          <p className="text-2xl font-bold text-purple-700">{statistics.newConsultants}</p>
          <p className="text-sm text-purple-700">Novos (&lt;45d)</p>
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
                      // Usar client do escopo superior (já disponível no map)
                      const clientInfo = client;
                      const coordenador = coordenadoresCliente.find(cc => cc.id_gestor_cliente === manager.id);
                      const recommendations = getRecommendations(consultant);
                      
                      // ✅ CORREÇÃO: Buscar nome da Analista de R&S da tabela users
                      const analistaRS = users.find(u => u.id === consultant.analista_rs_id);
                      const analistaRSName = analistaRS?.nome_usuario || 'N/A';

                      return (
                        <div 
                          key={consultant.id} 
                          className="consultant-card-redesign"
                          style={{ borderLeftColor: getScoreColor(finalScore) }}
                        >
                          {/* ===== HEADER: Nome + Botões + Score ===== */}
                          <div className="card-header-row">
                            <div className="card-header-left">
                              <h3 className="consultant-name-redesign">{consultant.nome_consultores}</h3>
                              <p className="consultant-cargo">{consultant.cargo_consultores || 'N/A'}</p>
                            </div>
                            
                            <div className="card-header-actions">
                              <button
                                onClick={() => onNavigateToAtividades(clientInfo?.razao_social_cliente, consultant.nome_consultores)}
                                className="btn-action btn-atividade"
                                title="Registrar nova atividade"
                              >
                                + Atividade
                              </button>
                              <button
                                onClick={() => handleViewRecommendations(consultant)}
                                disabled={loadingRecommendations}
                                className="btn-action btn-recomendacao"
                                title="Ver recomendações"
                              >
                                {loadingRecommendations ? '⏳' : '⚡'} Ver Recomendação
                              </button>
                              <button
                                onClick={() => handleViewHistoryClick(consultant)}
                                className="btn-action btn-historico"
                                title="Ver histórico"
                              >
                                Ver Histórico
                              </button>
                            </div>

                            {/* Score Badge */}
                            <div className="card-score-badge" style={{ backgroundColor: getScoreColor(finalScore) }}>
                              {isNew && daysSinceHiring && (
                                <div className="score-new-badge">
                                  <span className="new-label">Novo</span>
                                  <span className="new-days">{daysSinceHiring}d</span>
                                </div>
                              )}
                              <span className="score-risk-label">RISCO</span>
                              <span className="score-risk-level">{getScoreLabel(finalScore)}</span>
                              <span className="score-risk-number">Score {finalScore || 3}</span>
                            </div>
                          </div>

                          {/* ===== BODY: Informações em Grid ===== */}
                          <div className="card-body-grid">
                            {/* Coluna 1: Contato do Consultor */}
                            <div className="card-info-block">
                              <div className="info-block-header">Contato do Consultor</div>
                              <div className="info-block-content">
                                {consultant.email_consultor && (
                                  <div className="info-row">
                                    <Mail className="info-icon" size={14} />
                                    <a href={`mailto:${consultant.email_consultor}`} className="info-link">
                                      {consultant.email_consultor}
                                    </a>
                                  </div>
                                )}
                                {consultant.celular && (
                                  <div className="info-row">
                                    <Phone className="info-icon" size={14} />
                                    <a href={`tel:${consultant.celular}`} className="info-link">
                                      {consultant.celular}
                                    </a>
                                  </div>
                                )}
                                {!consultant.email_consultor && !consultant.celular && (
                                  <span className="info-na">Não informado</span>
                                )}
                              </div>
                            </div>

                            {/* Coluna 2: Cliente */}
                            <div className="card-info-block">
                              <div className="info-block-header">Cliente</div>
                              <div className="info-block-content">
                                <span className="info-value-highlight">{clientInfo?.razao_social_cliente || 'N/A'}</span>
                              </div>
                            </div>

                            {/* Coluna 3: Gestor */}
                            <div className="card-info-block">
                              <div className="info-block-header">Gestor</div>
                              <div className="info-block-content">
                                <span className="info-value">{manager.nome_gestor_cliente || 'N/A'}</span>
                                {manager.email_gestor && (
                                  <div className="info-row">
                                    <Mail className="info-icon" size={14} />
                                    <a href={`mailto:${manager.email_gestor}`} className="info-link">
                                      {manager.email_gestor}
                                    </a>
                                  </div>
                                )}
                                {manager.celular && (
                                  <div className="info-row">
                                    <Phone className="info-icon" size={14} />
                                    <a href={`tel:${manager.celular}`} className="info-link">
                                      {manager.celular}
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Coluna 4: Coordenador */}
                            <div className="card-info-block">
                              <div className="info-block-header">Coordenador</div>
                              <div className="info-block-content">
                                {coordenador ? (
                                  <>
                                    <span className="info-value">{coordenador.nome_coordenador_cliente || 'N/A'}</span>
                                    {coordenador.email_coordenador && (
                                      <div className="info-row">
                                        <Mail className="info-icon" size={14} />
                                        <a href={`mailto:${coordenador.email_coordenador}`} className="info-link">
                                          {coordenador.email_coordenador}
                                        </a>
                                      </div>
                                    )}
                                    {coordenador.celular && (
                                      <div className="info-row">
                                        <Phone className="info-icon" size={14} />
                                        <a href={`tel:${coordenador.celular}`} className="info-link">
                                          {coordenador.celular}
                                        </a>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className="info-na">N/A</span>
                                )}
                              </div>
                            </div>

                            {/* Coluna 5: Analista de R&S */}
                            <div className="card-info-block">
                              <div className="info-block-header">
                                <FocalRSIcon className="info-header-icon" size={14} />
                                Analista de R&S
                              </div>
                              <div className="info-block-content">
                                <span className="info-value">{analistaRSName}</span>
                              </div>
                            </div>
                          </div>
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

      {/* Modais */}
      {viewingReport && (
        <ReportDetailsModal
          report={viewingReport}
          onClose={() => setViewingReport(null)}
        />
      )}

      {showHistoryModal && selectedConsultantForHistory && (
        <HistoricoAtividadesModal
          consultant={selectedConsultantForHistory}
          reports={loadedReports}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedConsultantForHistory(null);
            setLoadedReports([]);
          }}
        />
      )}

      {/* ============================================ */}
      {/* ✅ NOVO: MODAL DE RECOMENDAÇÕES */}
      {/* ============================================ */}
      {showRecommendationsModal && selectedConsultantForRecommendations && selectedRecommendations && (
        <RecommendationsModal
          isOpen={showRecommendationsModal}
          onClose={handleCloseRecommendations}
          consultant={selectedConsultantForRecommendations}
          analysis={selectedRecommendations}
        />
      )}
    </div>
  );
};

export default Quarentena;
