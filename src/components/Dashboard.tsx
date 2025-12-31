import React, { useState, useMemo, useEffect } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantReport, RiskScore } from '@/types';
import StatusCircle from './StatusCircle';
import ReportDetailsModal from './ReportDetailsModal';
import MonthlyReportsModal from './MonthlyReportsModal';


interface DashboardProps {
  consultants: Consultant[];
  clients: Client[];
  usuariosCliente: UsuarioCliente[];
  coordenadoresCliente: CoordenadorCliente[];
  currentUser: User;
  users: User[];
  loadConsultantReports: (consultantId: number) => Promise<ConsultantReport[]>;
  onNavigateToAtividades: (clientName?: string, consultantName?: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  consultants = [], 
  clients = [], 
  usuariosCliente = [], 
  coordenadoresCliente = [], 
  currentUser, 
  users,
  loadConsultantReports,
  onNavigateToAtividades
}) => {
  
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [selectedManager, setSelectedManager] = useState<string>('all');
  const [selectedConsultant, setSelectedConsultant] = useState<string>('all');
  const [selectedScore, setSelectedScore] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('ativo'); // ✅ NOVO: Filtro de status (ativo/inativo/todos)
  const [viewingReport, setViewingReport] = useState<ConsultantReport | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [yearInitialized, setYearInitialized] = useState<boolean>(false);
  
  // Estados para o modal de histórico mensal completo
  const [showMonthlyReportsModal, setShowMonthlyReportsModal] = useState<boolean>(false);
  const [selectedMonthReports, setSelectedMonthReports] = useState<{
    consultant: Consultant;
    month: number;
    reports: ConsultantReport[];
  } | null>(null);

  // ============================================================================
  // ✅ CORREÇÃO: Buscar anos REAIS do Supabase (consultores + relatórios)
  // ============================================================================
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const uniqueYears = new Set<number>();
    
    // 1. Extrair anos do campo ano_vigencia dos consultores
    consultants.forEach(c => {
      if (c.ano_vigencia !== null && c.ano_vigencia !== undefined && !isNaN(c.ano_vigencia)) {
        uniqueYears.add(c.ano_vigencia);
      }
    });
    
    // 2. Extrair anos dos relatórios (consultant_reports)
    consultants.forEach(c => {
      const reports = c.consultant_reports || c.reports || [];
      reports.forEach((r: any) => {
        const reportYear = r.year || r.reportYear;
        if (reportYear !== null && reportYear !== undefined && !isNaN(reportYear)) {
          uniqueYears.add(reportYear);
        }
      });
    });
    
    // 3. Se não encontrou nenhum ano, adicionar apenas o ano atual como fallback
    if (uniqueYears.size === 0) {
      uniqueYears.add(currentYear);
    }
    
    // Converter para array e ordenar (mais recente primeiro)
    return [...uniqueYears].sort((a, b) => b - a);
  }, [consultants]);

  // ============================================================================
  // EFEITO 1: Inicializar o ano selecionado apenas uma vez
  // ============================================================================
  useEffect(() => {
    if (!yearInitialized && availableYears.length > 0) {
      setSelectedYear(availableYears[0]);
      setYearInitialized(true);
    }
  }, [availableYears, yearInitialized]);

  // ============================================================================
  // EFEITO 2: Resetar filtros quando o cliente muda
  // ============================================================================
  useEffect(() => { 
    setSelectedManager('all'); 
    setSelectedConsultant('all'); 
  }, [selectedClient]);

  // ============================================================================
  // EFEITO 3: Resetar consultor quando o gestor muda
  // ============================================================================
  useEffect(() => { 
    setSelectedConsultant('all'); 
  }, [selectedManager]);

  // ============================================================================
  // FUNÇÕES AUXILIARES
  // ============================================================================

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
      if (selectedManager !== 'all') {
        clientManagers = clientManagers.filter(uc => uc.id === parseInt(selectedManager));
      }
      
      const managers = clientManagers.map(manager => {
        // ✅ CORREÇÃO v2.3: Filtrar por status conforme seleção do usuário
        let managerConsultants = consultants.filter(c => {
          if (c.gestor_imediato_id !== manager.id) return false;
          
          // Filtro de status
          if (selectedStatus === 'ativo') {
            return c.status === 'Ativo';
          } else if (selectedStatus === 'inativo') {
            return c.status === 'Perdido' || c.status === 'Encerrado';
          }
          // selectedStatus === 'todos' - retorna todos
          return true;
        });
        
        // ✅ CORREÇÃO: Filtrar por ano - consultores sem ano_vigencia aparecem em todos os anos
        managerConsultants = managerConsultants.filter(c => {
          // Se o consultor não tem ano_vigencia definido, mostrar em todos os anos
          if (c.ano_vigencia === null || c.ano_vigencia === undefined) {
            return true;
          }
          return c.ano_vigencia === selectedYear;
        });

        // Aplicar filtro de score selecionado
        if (selectedScore !== 'all') {
          const scoreNum = parseInt(selectedScore, 10);
          managerConsultants = managerConsultants.filter(c => getValidFinalScore(c) === scoreNum);
        }

        if (selectedConsultant !== 'all') {
          managerConsultants = managerConsultants.filter(c => c.nome_consultores === selectedConsultant);
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
  }, [clients, consultants, usuariosCliente, coordenadoresCliente, selectedClient, selectedManager, selectedConsultant, selectedYear, selectedScore, selectedStatus]);

  // ============================================================================
  // CÁLCULO DE ESTATÍSTICAS (NOVO)
  // ============================================================================
  const statistics = useMemo(() => {
    const stats = { total: 0, excellent: 0, good: 0, medium: 0, high: 0, critical: 0 };
    
    // Contar todos os consultores que aparecem na estrutura de dados filtrada
    const allConsultants = structuredData.flatMap(client => 
      client.managers.flatMap(manager => manager.consultants)
    );
    
    stats.total = allConsultants.length;

    allConsultants.forEach(consultant => {
      const score = getValidFinalScore(consultant);
      if (score !== null) {
        switch (score) {
          case 1: stats.excellent++; break;
          case 2: stats.good++; break;
          case 3: stats.medium++; break;
          case 4: stats.high++; break;
          case 5: stats.critical++; break;
        }
      }
    });

    return stats;
  }, [structuredData]);

  // ============================================================================
  // FUNÇÃO: Buscar TODOS os relatórios de um mês específico (CORRIGIDA)
  // ============================================================================
  const getAllReportsForMonth = (consultant: Consultant, month: number): ConsultantReport[] => {
    
    let allReports: ConsultantReport[] = [];
    
    // Prioridade 1: Buscar em consultant_reports (dados do Supabase)
    if (consultant.consultant_reports && Array.isArray(consultant.consultant_reports) && consultant.consultant_reports.length > 0) {
      
      // CORREÇÃO: Usar o campo 'month' diretamente (não extrair de created_at)
      const reportsFromSupabase = consultant.consultant_reports.filter(r => {
        const reportMonth = (r as any).month; // Campo 'month' existe diretamente no Supabase
        
        if (!reportMonth) {
          return false;
        }
        
        return reportMonth === month;
      });
      
      if (reportsFromSupabase.length > 0) {
        allReports = reportsFromSupabase.sort((a, b) => {
          const dateA = new Date((a as any).created_at || '');
          const dateB = new Date((b as any).created_at || '');
          return dateB.getTime() - dateA.getTime(); // Mais recente primeiro
        });
        
        return allReports;
      }
    }
    
    // Prioridade 2: Fallback para reports (dados locais)
    if (consultant.reports && Array.isArray(consultant.reports) && consultant.reports.length > 0) {
      
      const localReports = consultant.reports
        .filter(r => r.month === month)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      if (localReports.length > 0) {
        return localReports;
      }
    }
    
    return [];
  };

  // ============================================================================
  // FUNÇÃO: Handler para clique no ícone mensal (COM LAZY LOADING REAL)
  // ============================================================================
  const handleMonthlyScoreClick = async (consultant: Consultant, month: number) => {
    console.log(`🖱️ Clique no ícone P${month} para ${consultant.nome_consultores}`);
    
    try {
      // 🔥 Carregar relatórios sob demanda do Supabase
      console.log(`📊 Carregando relatórios do Supabase para consultor ${consultant.id}...`);
      const allReports = await loadConsultantReports(consultant.id);
      
      // Filtrar apenas os relatórios do mês selecionado
      const monthReports = allReports.filter(r => (r as any).month === month);
      
      console.log(`✅ ${monthReports.length} relatórios encontrados para o mês ${month}`);
      
      // Abrir modal com os relatórios carregados
      setSelectedMonthReports({
        consultant,
        month,
        reports: monthReports
      });
      setShowMonthlyReportsModal(true);
    } catch (error) {
      console.error('❌ Erro ao carregar relatórios:', error);
      // Abrir modal vazio em caso de erro
      setSelectedMonthReports({
        consultant,
        month,
        reports: []
      });
      setShowMonthlyReportsModal(true);
    }
  };

  // ============================================================================
  // EARLY RETURN - DEPOIS DE TODOS OS HOOKS
  // ============================================================================
  if (consultants.length === 0 || clients.length === 0) {
    return <div className="p-6 text-center text-gray-500">Carregando dados do Supabase...</div>;
  }

  return (
    <div className="p-6 rounded-lg shadow-md border-t-4 bg-white border-transparent">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-[#4D5253]">
          Dashboard de Acompanhamento
        </h2>

      </div>
      
      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Ano:</label>
          <select 
            value={selectedYear} 
            onChange={e => setSelectedYear(parseInt(e.target.value))} 
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Cliente:</label>
          <select 
            value={selectedClient} 
            onChange={e => setSelectedClient(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="all">Todos os Clientes</option>
            {[...new Set(clients.map(c => c.razao_social_cliente))].sort().map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Gestor:</label>
          <select 
            value={selectedManager} 
            onChange={e => setSelectedManager(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="all">Todos os Gestores</option>
            {selectedClient !== 'all' && (
              usuariosCliente
                .filter(uc => clients.find(c => c.id === uc.id_cliente && c.razao_social_cliente === selectedClient))
                .map(uc => <option key={uc.id} value={uc.id}>{uc.nome_gestor_cliente}</option>)
            )}
          </select>
        </div>

        {/* ✅ NOVO: Filtro de Status */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Status:</label>
          <select 
            value={selectedStatus} 
            onChange={e => setSelectedStatus(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="ativo">✅ Ativos</option>
            <option value="inativo">❌ Inativos</option>
            <option value="todos">📋 Todos</option>
          </select>
        </div>

        {/* Filtro de Score */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Score:</label>
          <select 
            value={selectedScore} 
            onChange={e => setSelectedScore(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="all">Todos os Scores</option>
            <option value="5">Score 5 - CRÍTICO</option>
            <option value="4">Score 4 - ALTO</option>
            <option value="3">Score 3 - MODERADO</option>
            <option value="2">Score 2 - BAIXO</option>
            <option value="1">Score 1 - MÍNIMO</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Consultor:</label>
          <select 
            value={selectedConsultant} 
            onChange={e => setSelectedConsultant(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="all">Todos os Consultores</option>
            {selectedManager !== 'all' && (
              consultants
                .filter(c => {
                  if (c.gestor_imediato_id !== parseInt(selectedManager)) return false;
                  // Aplicar filtro de status também aqui
                  if (selectedStatus === 'ativo') return c.status === 'Ativo';
                  if (selectedStatus === 'inativo') return c.status === 'Perdido' || c.status === 'Encerrado';
                  return true;
                })
                .map(c => <option key={c.id} value={c.nome_consultores}>{c.nome_consultores}</option>)
            )}
          </select>
        </div>
      </div>

      {/* PAINEL DE ESTATÍSTICAS (NOVO) */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        <div className="bg-gray-100 p-4 rounded-lg text-center shadow">
          <p className="text-2xl font-bold text-gray-800">{statistics.total}</p>
          <p className="text-sm text-gray-600">Consultores</p>
        </div>
        <div className="bg-green-100 p-4 rounded-lg text-center shadow">
          <p className="text-2xl font-bold text-green-700">{statistics.excellent}</p>
          <p className="text-sm text-green-700">Excelente</p>
        </div>
        <div className="bg-blue-100 p-4 rounded-lg text-center shadow">
          <p className="text-2xl font-bold text-blue-700">{statistics.good}</p>
          <p className="text-sm text-blue-700">Bom</p>
        </div>
        <div className="bg-yellow-100 p-4 rounded-lg text-center shadow">
          <p className="text-2xl font-bold text-yellow-700">{statistics.medium}</p>
          <p className="text-sm text-yellow-700">Médio</p>
        </div>
        <div className="bg-orange-100 p-4 rounded-lg text-center shadow">
          <p className="text-2xl font-bold text-orange-700">{statistics.high}</p>
          <p className="text-sm text-orange-700">Alto</p>
        </div>
        <div className="bg-red-100 p-4 rounded-lg text-center shadow">
          <p className="text-2xl font-bold text-red-700">{statistics.critical}</p>
          <p className="text-sm text-red-700">Crítico</p>
        </div>
      </div>

      {/* Dados */}
      <div className="space-y-8">
        {structuredData.map(client => (
          (client.managers.length > 0) && (
            <div key={client.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <h2 className="text-xl font-bold text-[#533738] mb-4">{client.razao_social_cliente}</h2>
              {client.managers.map(manager => (
                <div key={manager.id} className="mb-6 border rounded bg-white overflow-hidden">
                  <div className="bg-gray-100 p-3 font-bold text-gray-800">{manager.nome_gestor_cliente}</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Consultor</th>
                          {[...Array(12)].map((_, i) => <th key={i} className="px-2 py-2 text-center text-xs font-bold text-gray-500">P{i+1}</th>)}
                          <th className="px-4 py-2 text-center text-xs font-bold text-gray-500 uppercase">Final</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {manager.consultants.map(consultant => (
                          <tr key={consultant.id}>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center justify-between gap-2">
                                <span>{consultant.nome_consultores}</span>
                                <button
                                  onClick={() => onNavigateToAtividades(client.razao_social_cliente, consultant.nome_consultores)}
                                  className="px-2 py-1 text-xs bg-white text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition whitespace-nowrap flex items-center gap-1"
                                  title="Registrar nova atividade para este consultor"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                  Atividade
                                </button>
                              </div>
                            </td>
                            {[...Array(12)].map((_, i) => {
                              const month = i + 1;
                              const monthScore = consultant[`parecer_${month}_consultor` as keyof Consultant] as RiskScore | null;
                              
                              return (
                                <td key={i} className="px-2 py-2 text-center">
                                  <StatusCircle 
                                    score={monthScore} 
                                    onClick={monthScore ? () => handleMonthlyScoreClick(consultant, month) : undefined} 
                                  />
                                </td>
                              );
                            })}
                            <td className="px-2 py-2 text-center">
                              {getValidFinalScore(consultant) !== null ? (
                                <div className="relative group flex justify-center">
                                  <div 
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md"
                                    style={{ backgroundColor: getScoreColor(getValidFinalScore(consultant)) }}
                                    title={`Score Final: ${getValidFinalScore(consultant)} - ${getScoreLabel(getValidFinalScore(consultant))}`}
                                  >
                                    {getValidFinalScore(consultant)}
                                  </div>
                                  <div className="absolute bottom-full mb-2 hidden group-hover:block w-max bg-gray-800 text-white text-xs rounded py-1 px-2 z-10">
                                    {getScoreLabel(getValidFinalScore(consultant))}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )
        ))}
      </div>

      {structuredData.every(c => c.managers.length === 0) && (
        <div className="p-8 text-center bg-white rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500 text-lg">✅ Nenhum consultor encontrado com os filtros selecionados</p>
        </div>
      )}

      {/* Modal Antigo - Mantido para compatibilidade */}
      <ReportDetailsModal report={viewingReport} onClose={() => setViewingReport(null)} />
      
      {/* Modal de Histórico Mensal Completo */}
      {showMonthlyReportsModal && selectedMonthReports && (
        <MonthlyReportsModal
          consultant={selectedMonthReports.consultant}
          month={selectedMonthReports.month}
          reports={selectedMonthReports.reports}
          onClose={() => {
            setShowMonthlyReportsModal(false);
            setSelectedMonthReports(null);
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
