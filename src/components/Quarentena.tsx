import React, { useState, useMemo } from 'react';
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
      // ✅ CORRIGIDO: Filtrar por id_gestao_de_pessoas do cliente
      if (selectedManager !== 'all') {
        const selectedManagerId = parseInt(selectedManager, 10);
        if (client.id_gestao_de_pessoas !== selectedManagerId) {
          return { ...client, managers: [] };
        }
      }
      
      let clientManagers = usuariosCliente.filter(uc => uc.id_cliente === client.id);
      
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
  }, [clients, consultants, usuariosCliente, coordenadoresCliente, selectedClient, selectedScore, selectedManager]);

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
                                <div className="flex items-center gap-3 flex-wrap">
                                  <h3 className="consultant-name">
                                    {consultant.nome_consultores}
                                  </h3>
                                  <button
                                    onClick={() => onNavigateToAtividades(clientInfo?.razao_social_cliente, consultant.nome_consultores)}
                                    className="px-2 py-1 text-xs bg-white text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition whitespace-nowrap"
                                    title="Registrar nova atividade para este consultor"
                                  >
                                    + Atividade
                                  </button>
                                  
                                  {/* ============================================ */}
                                  {/* ✅ NOVO: Botão "Ver Recomendação" com Modal */}
                                  {/* ============================================ */}
                                  <button
                                    onClick={() => handleViewRecommendations(consultant)}
                                    disabled={loadingRecommendations}
                                    className="px-2 py-1 text-xs bg-white text-indigo-600 border border-indigo-600 rounded hover:bg-indigo-50 transition whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Ver recomendações de ação para este consultor"
                                  >
                                    {loadingRecommendations ? '⏳ Carregando...' : '⚡ Ver Recomendação'}
                                  </button>

                                  {/* ✅ NOVO: Botão "Ver Histórico" */}
                                  <button
                                    onClick={() => handleViewHistoryClick(consultant)}
                                    className="px-2 py-1 text-xs bg-white text-purple-600 border border-purple-600 rounded hover:bg-purple-50 transition whitespace-nowrap"
                                    title="Ver histórico de atividades"
                                  >
                                    Ver Histórico
                                  </button>
                                </div>
                                <p className="consultant-profession">{consultant.cargo_consultores || 'N/A'}</p>
                                
                                {/* ✅ CORRIGIDO: Email e Celular do Consultor movidos para abaixo do cargo */}
                                <div className="space-y-1 mt-2">
                                  {consultant.email_consultor && (
                                    <div className="flex items-center gap-2 text-sm">
                                      <Mail className="w-3 h-3 text-blue-600" />
                                      <a href={`mailto:${consultant.email_consultor}`} className="text-blue-700 hover:underline">
                                        {consultant.email_consultor}
                                      </a>
                                    </div>
                                  )}
                                  {consultant.celular && (
                                    <div className="flex items-center gap-2 text-sm">
                                      <Phone className="w-3 h-3 text-blue-600" />
                                      <a href={`tel:${consultant.celular}`} className="text-blue-700 hover:underline">
                                        {consultant.celular}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* ✅ CORRIGIDO: Detalhes reorganizados - Cliente, Gestor, Coordenador, Analista de R&S */}
                              <div className="space-y-3 mt-3">
                                {/* Cliente */}
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-700">Cliente:</span>
                                    <span className="text-gray-900">{clientInfo?.razao_social_cliente || 'N/A'}</span>
                                  </div>
                                </div>

                                {/* ✅ CORRIGIDO: Renomeado de "Gestor de Pessoas" para "Gestor" */}
                                <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="font-semibold text-purple-900">Gestor</span>
                                  </div>
                                  <div className="space-y-1 ml-6">
                                    <div className="text-sm font-medium text-purple-900">{manager.nome_gestor_cliente || 'N/A'}</div>
                                    {manager.email_gestor && (
                                      <div className="flex items-center gap-2 text-sm">
                                        <Mail className="w-3 h-3 text-purple-600" />
                                        <a href={`mailto:${manager.email_gestor}`} className="text-purple-700 hover:underline">
                                          {manager.email_gestor}
                                        </a>
                                      </div>
                                    )}
                                    {manager.celular && (
                                      <div className="flex items-center gap-2 text-sm">
                                        <Phone className="w-3 h-3 text-purple-600" />
                                        <a href={`tel:${manager.celular}`} className="text-purple-700 hover:underline">
                                          {manager.celular}
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Coordenador */}
                                {coordenador && (
                                  <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="font-semibold text-green-900">Coordenador</span>
                                    </div>
                                    <div className="space-y-1 ml-6">
                                      <div className="text-sm font-medium text-green-900">{coordenador.nome_coordenador || 'N/A'}</div>
                                      {coordenador.email_coordenador && (
                                        <div className="flex items-center gap-2 text-sm">
                                          <Mail className="w-3 h-3 text-green-600" />
                                          <a href={`mailto:${coordenador.email_coordenador}`} className="text-green-700 hover:underline">
                                            {coordenador.email_coordenador}
                                          </a>
                                        </div>
                                      )}
                                      {coordenador.celular && (
                                        <div className="flex items-center gap-2 text-sm">
                                          <Phone className="w-3 h-3 text-green-600" />
                                          <a href={`tel:${coordenador.celular}`} className="text-green-700 hover:underline">
                                            {coordenador.celular}
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* ✅ CORRIGIDO: Analista de R&S SEM email/celular (movidos para cima) */}
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                  <div className="flex items-center gap-2">
                                    <FocalRSIcon className="w-4 h-4 text-blue-600" size={16} />
                                    <span className="font-semibold text-blue-900">Analista de R&S:</span>
                                    <span className="text-sm font-medium text-blue-900">{consultant.analista_rs || 'N/A'}</span>
                                  </div>
                                </div>
                              </div>

                              {/* ❌ REMOVIDO: Seção "Recomendações de Ação" inline foi removida conforme solicitado */}
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
                                  <div 
                                    className="score-badge"
                                    style={{ backgroundColor: getScoreColor(finalScore) }}
                                    title="Score do consultor"
                                  >
                                    <span className="score-label-text">RISCO</span>
                                    <span className="score-label-text">{getScoreLabel(finalScore)}</span>
                                    <span className="score-number">Score {finalScore}</span>
                                  </div>
                                ) : (
                                  <div 
                                    className="score-badge"
                                    style={{ backgroundColor: '#fbc02d' }}
                                    title="Score do consultor"
                                  >
                                    <span className="score-label-text">RISCO</span>
                                    <span className="score-label-text">MODERADO</span>
                                    <span className="score-number">Score 3</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* ❌ REMOVIDO: Seção de Recomendações foi completamente removida */}
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
